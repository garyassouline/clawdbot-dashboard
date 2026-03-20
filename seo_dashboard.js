// seo_dashboard.js - Logic for the SEO tab of the dashboard

let seoKpisData = null;
let seoChartsData = null;
let seoTopPagesData = null;
let seoTopQueriesData = null;
let seoTrendsData = null;

let seoClicksImpressionsChartInst, seoPositionChartInst, seoCtrChartInst;

const SEO_DATA_PATH = './seo_data/';

async function loadSeoData() {
    console.log("Loading SEO data from", SEO_DATA_PATH);
    try {
        const [kpisRes, chartsRes, topPagesRes, topQueriesRes, trendsRes] = await Promise.all([
            fetch(SEO_DATA_PATH + 'kpis.json?cb=' + Date.now()),
            fetch(SEO_DATA_PATH + 'charts_data.json?cb=' + Date.now()),
            fetch(SEO_DATA_PATH + 'top_pages.json?cb=' + Date.now()),
            fetch(SEO_DATA_PATH + 'top_queries.json?cb=' + Date.now()),
            fetch(SEO_DATA_PATH + 'trends.json?cb=' + Date.now()),
        ]);

        if (!kpisRes.ok || !chartsRes.ok || !topPagesRes.ok || !topQueriesRes.ok || !trendsRes.ok) {
            throw new Error("One or more JSON files could not be loaded");
        }

        seoKpisData = await kpisRes.json();
        seoChartsData = await chartsRes.json();
        seoTopPagesData = await topPagesRes.json();
        seoTopQueriesData = await topQueriesRes.json();
        seoTrendsData = await trendsRes.json();

        renderSEOTabContent();
    } catch (e) {
        console.error("Error loading SEO data:", e);
        const container = document.getElementById('seo-alerts-container');
        if (container) {
            container.innerHTML = `<div class="alert warn">⚠️ Erreur de chargement des données SEO : ${e.message}</div>`;
        }
    }
}

function renderSEOTabContent() {
    if (!seoKpisData) return;

    // Render KPIs
    const elClicks = document.getElementById('seo-total-clicks');
    const elImps = document.getElementById('seo-total-impressions');
    const elCtr = document.getElementById('seo-avg-ctr');
    const elPos = document.getElementById('seo-avg-position');

    if (elClicks) elClicks.textContent = fmt(seoKpisData.totalClicks);
    if (elImps) elImps.textContent = fmt(seoKpisData.totalImpressions);
    if (elCtr) elCtr.textContent = seoKpisData.averageCTR.toFixed(2) + '%';
    if (elPos) elPos.textContent = seoKpisData.averagePosition.toFixed(1);

    // KPI trends
    const trClicks = document.getElementById('seo-clicks-trend');
    const trImps = document.getElementById('seo-impressions-trend');
    const trCtr = document.getElementById('seo-ctr-trend');
    const trPos = document.getElementById('seo-position-trend');

    if (trClicks) trClicks.innerHTML = getTrendHtml(seoKpisData.clicksTrend);
    if (trImps) trImps.innerHTML = getTrendHtml(seoKpisData.impressionsTrend);
    if (trCtr) trCtr.innerHTML = getTrendHtml(seoKpisData.ctrTrend);
    if (trPos) trPos.innerHTML = getTrendHtml(seoKpisData.positionTrend, true);

    // Render Charts
    renderSeoCharts();

    // Render Tables
    const topPagesBody = document.getElementById('seo-top-pages-body');
    if (topPagesBody && seoTopPagesData) {
        topPagesBody.innerHTML = seoTopPagesData.map(p => `
            <tr>
                <td title="${p.url}"><a href="${p.url}" target="_blank" style="color:var(--accent2);text-decoration:none">${p.url.split('/').pop() || p.url}</a></td>
                <td style="text-align:right;font-weight:600">${fmt(p.clicks)}</td>
                <td style="text-align:right">${fmt(p.impressions)}</td>
                <td style="text-align:right">${p.ctr.toFixed(2)}%</td>
                <td style="text-align:right">${p.position.toFixed(1)} ${getTrendArrowHtml(p.positionTrend, true)}</td>
            </tr>
        `).join('');
    }

    const topQueriesBody = document.getElementById('seo-top-queries-body');
    if (topQueriesBody && seoTopQueriesData) {
        topQueriesBody.innerHTML = seoTopQueriesData.map(q => `
            <tr>
                <td style="font-weight:600">${q.query}</td>
                <td style="text-align:right;font-weight:600">${fmt(q.clicks)}</td>
                <td style="text-align:right">${fmt(q.impressions)}</td>
                <td style="text-align:right">${q.ctr.toFixed(2)}%</td>
                <td style="text-align:right">${q.position.toFixed(1)} ${getTrendArrowHtml(q.positionTrend, true)}</td>
            </tr>
        `).join('');
    }

    renderTrendsTable('seo-rising-queries-body', seoTrendsData?.risingQueries, false);
    renderTrendsTable('seo-declining-queries-body', seoTrendsData?.decliningQueries, true);
    renderTrendsTable('seo-rising-pages-body', seoTrendsData?.risingPages, false);
    renderTrendsTable('seo-declining-pages-body', seoTrendsData?.decliningPages, true);
}

function getTrendHtml(trendData, inverse = false) {
    if (!trendData) return '—';
    const value = trendData.value.toFixed(1);
    let arrow = '';
    let colorClass = 'trend-stable';

    if (trendData.direction === 'up') {
        arrow = inverse ? '↓' : '↑';
        colorClass = inverse ? 'trend-down' : 'trend-up';
    } else if (trendData.direction === 'down') {
        arrow = inverse ? '↑' : '↓';
        colorClass = inverse ? 'trend-up' : 'trend-down';
    }
    return `<span class="${colorClass}" style="font-weight:700">${arrow} ${value}%</span>`;
}

function getTrendArrowHtml(trendData, inverse = false) {
    if (!trendData) return '';
    let arrow = '';
    let colorClass = 'trend-stable';

    if (trendData.direction === 'up') {
        arrow = inverse ? '↓' : '↑';
        colorClass = inverse ? 'trend-down' : 'trend-up';
    } else if (trendData.direction === 'down') {
        arrow = inverse ? '↑' : '↓';
        colorClass = inverse ? 'trend-up' : 'trend-down';
    }
    return `<span class="${colorClass}" style="margin-left:5px;font-weight:700">${arrow}</span>`;
}

function renderTrendsTable(tableId, data, inverseTrend = false) {
    const tableBody = document.getElementById(tableId);
    if (tableBody && data) {
        tableBody.innerHTML = data.map(item => `
            <tr>
                <td style="font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.name || item.query || item.url.split('/').pop()}</td>
                <td style="text-align:right;font-weight:600">${fmt(item.clicks)}</td>
                <td style="text-align:right">${fmt(item.impressions)}</td>
                <td style="text-align:right">${item.ctr.toFixed(2)}%</td>
                <td style="text-align:right">${item.position.toFixed(1)}</td>
                <td style="text-align:right">${getTrendHtml(item.trend, inverseTrend)}</td>
            </tr>
        `).join('') || '<tr><td colspan="6" class="empty">Aucune donnée</td></tr>';
    }
}

function renderSeoCharts() {
    if (!seoChartsData) return;

    const clicksImpsCtx = document.getElementById('seo-clicks-impressions-chart')?.getContext('2d');
    if (clicksImpsCtx) {
        if (seoClicksImpressionsChartInst) seoClicksImpressionsChartInst.destroy();
        seoClicksImpressionsChartInst = new Chart(clicksImpsCtx, {
            type: 'line',
            data: {
                labels: seoChartsData.dates.map(d => d.split('-').slice(1).reverse().join('/')),
                datasets: [
                    {
                        label: 'Clics',
                        data: seoChartsData.clicks,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59,130,246,0.1)',
                        fill: true, tension: 0.3
                    },
                    {
                        label: 'Impressions',
                        data: seoChartsData.impressions,
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139,92,246,0.1)',
                        fill: true, tension: 0.3,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: { 
                responsive:true, 
                maintainAspectRatio:false, 
                scales:{
                    x:{grid:{color:'#252838'},ticks:{color:'#64748b'}},
                    y:{grid:{color:'#252838'},ticks:{color:'#64748b'}},
                    y1:{position:'right',grid:{display:false},ticks:{color:'#64748b'}}
                },
                plugins: { legend: { labels: { color: '#6b7280' } } }
            }
        });
    }

    const positionCtx = document.getElementById('seo-position-chart')?.getContext('2d');
    if (positionCtx) {
        if (seoPositionChartInst) seoPositionChartInst.destroy();
        seoPositionChartInst = new Chart(positionCtx, {
            type: 'line',
            data: {
                labels: seoChartsData.dates.map(d => d.split('-').slice(1).reverse().join('/')),
                datasets: [
                    {
                        label: 'Position Moyenne',
                        data: seoChartsData.averagePosition,
                        borderColor: '#e5484d',
                        backgroundColor: 'rgba(229,72,77,0.1)',
                        fill: true, tension: 0.3
                    }
                ]
            },
            options: { 
                responsive:true, maintainAspectRatio:false, 
                scales: {
                    x:{grid:{color:'#252838'},ticks:{color:'#64748b'}},
                    y:{
                        reverse: true,
                        grid:{color:'#252838'},ticks:{color:'#64748b'}
                    }
                },
                plugins: { legend: { labels: { color: '#6b7280' } } }
            }
        });
    }

    const ctrCtx = document.getElementById('seo-ctr-chart')?.getContext('2d');
    if (ctrCtx) {
        if (seoCtrChartInst) seoCtrChartInst.destroy();
        seoCtrChartInst = new Chart(ctrCtx, {
            type: 'line',
            data: {
                labels: seoChartsData.dates.map(d => d.split('-').slice(1).reverse().join('/')),
                datasets: [
                    {
                        label: 'CTR Moyen',
                        data: seoChartsData.averageCTR,
                        borderColor: '#16a34a',
                        backgroundColor: 'rgba(22,163,74,0.1)',
                        fill: true, tension: 0.3
                    }
                ]
            },
            options: { 
                responsive:true, maintainAspectRatio:false, 
                scales:{x:{grid:{color:'#252838'},ticks:{color:'#64748b'}},y:{grid:{color:'#252838'},ticks:{color:'#64748b'}}},
                plugins: { legend: { labels: { color: '#6b7280' } } }
            }
        });
    }
}

function renderSEOTab() {
    console.log("SEO tab activated");
    loadSeoData();
}
