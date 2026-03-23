// vectorai_dashboard.js - Logic for the AI Analysis tab

const VECTORAI_DATA_PATH = './ai_data/';

let vectoraiMeta = null;
let vectoraiStats = null;
let vectoraiAnalyses = {};

const ANALYSIS_KEYS = ['overview', 'opportunities', 'declining', 'content_gaps', 'cannibalization'];

const ANALYSIS_CONFIG = {
    overview: { icon: '📊', label: 'Performance Overview', cardClass: 'card-overview' },
    opportunities: { icon: '🎯', label: 'Opportunités SEO', cardClass: 'card-opportunities' },
    declining: { icon: '📉', label: 'Requêtes en Déclin', cardClass: 'card-declining' },
    content_gaps: { icon: '🧩', label: 'Gaps de Contenu', cardClass: 'card-content-gaps' },
    cannibalization: { icon: '⚔️', label: 'Cannibalisation', cardClass: 'card-cannibalization' }
};

async function loadVectorAIData() {
    const container = document.getElementById('vectorai-alerts-container');
    const gridEl = document.getElementById('vectorai-analysis-grid');

    if (gridEl) gridEl.innerHTML = '<div class="vectorai-loading"><div class="spinner"></div> Chargement des analyses IA…</div>';

    try {
        const cb = Date.now();

        const [metaRes, statsRes] = await Promise.all([
            fetch(VECTORAI_DATA_PATH + 'meta.json?cb=' + cb),
            fetch(VECTORAI_DATA_PATH + 'stats.json?cb=' + cb),
        ]);

        if (!metaRes.ok || !statsRes.ok) throw new Error('meta.json ou stats.json introuvable');

        vectoraiMeta = await metaRes.json();
        vectoraiStats = await statsRes.json();

        const analysisResults = await Promise.all(
            ANALYSIS_KEYS.map(key =>
                fetch(VECTORAI_DATA_PATH + key + '.json?cb=' + cb)
                    .then(r => r.ok ? r.json() : null)
                    .catch(() => null)
            )
        );

        ANALYSIS_KEYS.forEach((key, i) => {
            vectoraiAnalyses[key] = analysisResults[i];
        });

        renderVectorAITabContent();

    } catch (e) {
        console.error('Error loading Vector AI data:', e);
        if (container) {
            container.innerHTML = '<div class="alert warn" style="background:rgba(229,72,77,0.08);border:1px solid var(--accent);border-radius:var(--radius);padding:14px 18px;margin-bottom:16px;font-size:0.82rem;color:var(--accent)">' +
                '⚠️ Données d\'analyse IA non disponibles. Lancez <code>python main.py export</code> pour générer les analyses.</div>';
        }
        if (gridEl) gridEl.innerHTML = '';
    }
}

function renderVectorAITabContent() {
    var alertsEl = document.getElementById('vectorai-alerts-container');
    if (alertsEl) alertsEl.innerHTML = '';

    // Freshness check
    if (vectoraiMeta && vectoraiMeta.generated_at) {
        var exportDate = new Date(vectoraiMeta.generated_at);
        var hoursDiff = (new Date() - exportDate) / (1000 * 60 * 60);
        if (hoursDiff > 24 && alertsEl) {
            alertsEl.innerHTML = '<div class="alert warn" style="background:rgba(245,158,11,0.08);border:1px solid var(--yellow);border-radius:var(--radius);padding:14px 18px;margin-bottom:16px;font-size:0.82rem;color:var(--yellow)">' +
                '⏳ Données générées il y a ' + Math.round(hoursDiff) + 'h — pensez à relancer l\'export.</div>';
        }
    }

    renderVectorAIKpis();
    renderVectorAICards();
}

function renderVectorAIKpis() {
    if (vectoraiStats) {
        var qp = document.getElementById('vectorai-kpi-querypairs');
        var pg = document.getElementById('vectorai-kpi-pages');
        if (qp) qp.textContent = typeof fmt !== 'undefined' ? fmt(vectoraiStats.total_query_pairs || 0) : (vectoraiStats.total_query_pairs || 0);
        if (pg) pg.textContent = typeof fmt !== 'undefined' ? fmt(vectoraiStats.total_pages || 0) : (vectoraiStats.total_pages || 0);
    }

    if (vectoraiMeta) {
        var dt = document.getElementById('vectorai-kpi-export');
        var pv = document.getElementById('vectorai-kpi-provider');
        if (dt) {
            var d = new Date(vectoraiMeta.generated_at);
            dt.textContent = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
        }
        if (pv) {
            var providerName = { gemini: 'Gemini Flash', grok: 'Grok 4.1', claude: 'Claude Opus' };
            pv.textContent = providerName[vectoraiMeta.provider] || vectoraiMeta.provider || '—';
        }
    }
}

function renderVectorAICards() {
    var gridEl = document.getElementById('vectorai-analysis-grid');
    if (!gridEl) return;

    var html = '';
    ANALYSIS_KEYS.forEach(function(key) {
        var config = ANALYSIS_CONFIG[key];
        var data = vectoraiAnalyses[key];

        if (!data) {
            html += '<div class="analysis-card ' + config.cardClass + '" style="opacity:0.5">' +
                '<div class="card-icon">' + config.icon + '</div>' +
                '<div class="card-label">' + config.label + '</div>' +
                '<div class="card-summary">Analyse non disponible</div></div>';
            return;
        }

        var metricsHtml = (data.key_metrics || []).map(function(m) {
            return '<span class="metric-badge ' + (m.color || 'blue') + '">' + m.label + ': ' + m.value + '</span>';
        }).join('');

        html += '<div class="analysis-card ' + config.cardClass + '" onclick="showAnalysisDetail(\'' + key + '\')">' +
            '<div class="card-icon">' + config.icon + '</div>' +
            '<div class="card-label">' + (data.title || config.label) + '</div>' +
            '<div class="card-summary">' + (data.summary || 'Cliquez pour voir l\'analyse complète') + '</div>' +
            '<div class="card-metrics">' + metricsHtml + '</div>' +
            '<div class="card-cta">Voir l\'analyse →</div></div>';
    });

    gridEl.innerHTML = html;
}

function showAnalysisDetail(key) {
    var detailEl = document.getElementById('vectorai-detail');
    var contentEl = document.getElementById('vectorai-detail-content');
    var titleEl = document.getElementById('vectorai-detail-title');
    var metaEl = document.getElementById('vectorai-detail-meta');

    if (!detailEl || !contentEl) return;

    var config = ANALYSIS_CONFIG[key];
    var data = vectoraiAnalyses[key];

    if (!data || !data.content_md) {
        detailEl.classList.remove('active');
        return;
    }

    if (titleEl) titleEl.innerHTML = config.icon + ' ' + (data.title || config.label);

    if (metaEl) {
        var providerName = { gemini: 'Gemini Flash', grok: 'Grok 4.1', claude: 'Claude Opus' };
        var provider = data.provider || (vectoraiMeta ? vectoraiMeta.provider : 'gemini');
        var date = data.generated_at ? new Date(data.generated_at).toLocaleString('fr-FR') : '—';
        metaEl.innerHTML = '<span class="provider-badge ' + provider + '">' + (providerName[provider] || provider) + '</span>' +
            '<span>Généré le ' + date + '</span>';
    }

    if (typeof marked !== 'undefined') {
        contentEl.innerHTML = marked.parse(data.content_md);
    } else {
        contentEl.innerHTML = '<pre style="white-space:pre-wrap">' + data.content_md.replace(/</g, '&lt;') + '</pre>';
    }

    detailEl.classList.add('active');
    detailEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeAnalysisDetail() {
    var detailEl = document.getElementById('vectorai-detail');
    if (detailEl) detailEl.classList.remove('active');
}

window.renderVectorAITab = function() { loadVectorAIData(); };
window.showAnalysisDetail = showAnalysisDetail;
window.closeAnalysisDetail = closeAnalysisDetail;
