// seo_dashboard.js - Logic for the SEO tab of the dashboard

let seoKpisData = null;
let seoChartsData = null;
let seoTopPagesData = null;
let seoTopQueriesData = null;
let seoTrendsData = null;

let seoClicksImpressionsChartInst, seoPositionChartInst, seoCtrChartInst;

const SEO_DATA_PATH = './seo_data/';

async function loadSeoData() {
    try {
        const [kpisRes, chartsRes, topPagesRes, topQueriesRes, trendsRes] = await Promise.all([
            fetch(SEO_DATA_PATH + 'kpis.json?cb=' + Date.now()),
            fetch(SEO_DATA_PATH + 'charts_data.json?cb=' + Date.now()),
            fetch(SEO_DATA_PATH + 'top_pages.json?cb=' + Date.now()),
            fetch(SEO_DATA_PATH + 'top_queries.json?cb=' + Date.now()),
            fetch(SEO_DATA_PATH + 'trends.json?cb=' + Date.now()),
        ]);

        seoKpisData = await kpisRes.json();
        seoChartsData = await chartsRes.json();
        seoTopPagesData = await topPagesRes.json();
        seoTopQueriesData = await topQueriesRes.json();
        seoTrendsData = await trendsRes.json();

        renderSEOTabContent();
    } catch (e) {
        console.error("Error loading SEO data:", e);
        document.getElementById('section-seo').innerHTML = '<div class="alert warn">⚠️ Erreur de chargement des données SEO.</div>';
    }
}

function renderSEOTabContent() {
    if (!seoKpisData) return; // Wait for data to be loaded

    // Render KPIs
    document.getElementById('seo-total-clicks').textContent = fmt(seoKpisData.totalClicks);
    document.getElementById('seo-total-impressions').textContent = fmt(seoKpisData.totalImpressions);
    document.getElementById('seo-avg-ctr').textContent = seoKpisData.averageCTR.toFixed(2) + '%';
    document.getElementById('seo-avg-position').textContent = seoKpisData.averagePosition.toFixed(1);

    // KPI trends (example, can be more dynamic)
    document.getElementById('seo-clicks-trend').innerHTML = getTrendHtml(seoKpisData.clicksTrend);
    document.getElementById('seo-impressions-trend').innerHTML = getTrendHtml(seoKpisData.impressionsTrend);
    document.getElementById('seo-ctr-trend').innerHTML = getTrendHtml(seoKpisData.ctrTrend);
    document.getElementById('seo-position-trend').innerHTML = getTrendHtml(seoKpisData.positionTrend, true); // true for inverse trend for position

    // Render Charts
    renderSeoCharts();

    // Render Top Pages
    const topPagesBody = document.getElementById('seo-top-pages-body');
    if (topPagesBody && seoTopPagesData) {
        topPagesBody.innerHTML = seoTopPagesData.map(p => `
            <tr>
                <td><a href="${p.url}" target="_blank">${p.url.split('/').pop() || p.url}</a></td>
                <td style="text-align:right">${fmt(p.clicks)}</td>
                <td style="text-align:right">${fmt(p.impressions)}</td>
                <td style="text-align:right">${p.ctr.toFixed(2)}%</td>
                <td style="text-align:right">${p.position.toFixed(1)} ${getTrendArrowHtml(p.positionTrend, true)}</td>
            </tr>
        `).join('');
    }

    // Render Top Queries
    const topQueriesBody = document.getElementById('seo-top-queries-body');
    if (topQueriesBody && seoTopQueriesData) {
        topQueriesBody.innerHTML = seoTopQueriesData.map(q => `
            <tr>
                <td>${q.query}</td>
                <td style="text-align:right">${fmt(q.clicks)}</td>
                <td style="text-align:right">${fmt(q.impressions)}</td>
                <td style="text-align:right">${q.ctr.toFixed(2)}%</td>
                <td style="text-align:right">${q.position.toFixed(1)} ${getTrendArrowHtml(q.positionTrend, true)}</td>
            </tr>
        `).join('');
    }

    // Render Rising/Declining Queries and Pages
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
    return `<span class="${colorClass}">${value}% ${arrow}</span>`;
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
    return `<span class="${colorClass}" style="margin-left:5px">${arrow}</span>`;
}

function renderTrendsTable(tableId, data, inverseTrend = false) {
    const tableBody = document.getElementById(tableId);
    if (tableBody && data) {
        tableBody.innerHTML = data.map(item => `
            <tr>
                <td>${item.name || item.query || item.url}</td>
                <td style="text-align:right">${fmt(item.clicks)}</td>
                <td style="text-align:right">${fmt(item.impressions)}</td>
                <td style="text-align:right">${item.ctr.toFixed(2)}%</td>
                <td style="text-align:right">${item.position.toFixed(1)} ${getTrendArrowHtml(item.trend, inverseTrend)}</td>
                <td style="text-align:right">${getTrendHtml(item.trend, inverseTrend)}</td>
            </tr>
        `).join('') || '<tr><td colspan="6" class="empty">Aucune donnée</td></tr>';
    }
}

function renderSeoCharts() {
    if (!seoChartsData) return;

    // Clicks & Impressions Chart
    const clicksImpsCtx = document.getElementById('seo-clicks-impressions-chart')?.getContext('2d');
    if (clicksImpsCtx) {
        if (seoClicksImpressionsChartInst) seoClicksImpressionsChartInst.destroy();
        seoClicksImpressionsChartInst = new Chart(clicksImpsCtx, {
            type: 'line',
            data: {
                labels: seoChartsData.dates.map(d => new Date(d).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' })),
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
                        fill: true, tension: 0.3
                    }
                ]
            },
            options: { responsive:true, maintainAspectRatio:false, scales:{x:{grid:{color:'#252838',ticks:{color:'#64748b'}}},y:{grid:{color:'#252838',ticks:{color:'#64748b'}}}} }
        });
    }

    // Position Chart
    const positionCtx = document.getElementById('seo-position-chart')?.getContext('2d');
    if (positionCtx) {
        if (seoPositionChartInst) seoPositionChartInst.destroy();
        seoPositionChartInst = new Chart(positionCtx, {
            type: 'line',
            data: {
                labels: seoChartsData.dates.map(d => new Date(d).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' })),
                datasets: [
                    {
                        label: 'Position Moyenne',
                        data: seoChartsData.averagePosition,
                        borderColor: '#e5484d',
                        backgroundColor: 'rgba(229,72,77,0.1)',
                        fill: true, tension: 0.3,
                        yAxisID: 'y', // Utilise l'axe y principal
                    }
                ]
            },
            options: { 
                responsive:true, maintainAspectRatio:false, 
                scales: {
                    x:{grid:{color:'#252838',ticks:{color:'#64748b'}}},
                    y:{
                        beginAtZero: false, 
                        reverse: true, // Inverse l'axe pour que les meilleures positions (plus petites valeurs) soient en haut
                        grid:{color:'#252838',ticks:{color:'#64748b'}}
                    }
                }
            }
        });
    }

    // CTR Chart
    const ctrCtx = document.getElementById('seo-ctr-chart')?.getContext('2d');
    if (ctrCtx) {
        if (seoCtrChartInst) seoCtrChartInst.destroy();
        seoCtrChartInst = new Chart(ctrCtx, {
            type: 'line',
            data: {
                labels: seoChartsData.dates.map(d => new Date(d).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' })),
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
            options: { responsive:true, maintainAspectRatio:false, scales:{x:{grid:{color:'#252838',ticks:{color:'#64748b'}}},y:{grid:{color:'#252838',ticks:{color:'#64748b'}}}} }
        });
    }
}

// Add this function to the global scope or ensure it's accessible
function renderSEOTab() {
    console.log("SEO tab activated, loading data...");
    loadSeoData();
}

// Make sure showSection can call renderSEOTab directly when the tab is clicked
// This assumes showSection is defined elsewhere in index.html or a global script
// If not, it needs to be adapted. The current showSection already accepts `id`.
