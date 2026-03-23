// vectorai_dashboard.js - Marmiton HQ: Search + Discover AI Analysis

var VECTORAI_DATA_PATH = './ai_data/';

var vectoraiMeta = null;
var vectoraiStats = null;
var vectoraiAnalyses = {};

var SEARCH_KEYS = ['overview', 'opportunities', 'declining', 'content_gaps', 'cannibalization'];
var DISCOVER_KEYS = ['discover_overview', 'discover_winners', 'discover_declining'];
var ALL_KEYS = SEARCH_KEYS.concat(DISCOVER_KEYS);

var ANALYSIS_CONFIG = {
    // Search analyses
    overview: { icon: '📊', label: 'Performance Overview', cardClass: 'card-overview', source: 'search' },
    opportunities: { icon: '🎯', label: 'Opportunités SEO', cardClass: 'card-opportunities', source: 'search' },
    declining: { icon: '📉', label: 'Requêtes en Déclin', cardClass: 'card-declining', source: 'search' },
    content_gaps: { icon: '🧩', label: 'Gaps de Contenu', cardClass: 'card-content-gaps', source: 'search' },
    cannibalization: { icon: '⚔️', label: 'Cannibalisation', cardClass: 'card-cannibalization', source: 'search' },
    // Discover analyses
    discover_overview: { icon: '✨', label: 'Discover Overview', cardClass: 'card-discover-overview', source: 'discover' },
    discover_winners: { icon: '🏆', label: 'Discover Winners', cardClass: 'card-discover-winners', source: 'discover' },
    discover_declining: { icon: '📉', label: 'Discover en Déclin', cardClass: 'card-discover-declining', source: 'discover' }
};

async function loadVectorAIData() {
    var container = document.getElementById('vectorai-alerts-container');
    var searchGrid = document.getElementById('vectorai-search-grid');
    var discoverGrid = document.getElementById('vectorai-discover-grid');

    if (searchGrid) searchGrid.innerHTML = '<div class="vectorai-loading"><div class="spinner"></div> Chargement…</div>';
    if (discoverGrid) discoverGrid.innerHTML = '<div class="vectorai-loading"><div class="spinner"></div> Chargement…</div>';

    try {
        var cb = Date.now();

        var responses = await Promise.all([
            fetch(VECTORAI_DATA_PATH + 'meta.json?cb=' + cb),
            fetch(VECTORAI_DATA_PATH + 'stats.json?cb=' + cb),
        ]);

        if (!responses[0].ok || !responses[1].ok) throw new Error('meta.json ou stats.json introuvable');

        vectoraiMeta = await responses[0].json();
        vectoraiStats = await responses[1].json();

        // Fetch all analyses in parallel
        var analysisResults = await Promise.all(
            ALL_KEYS.map(function(key) {
                return fetch(VECTORAI_DATA_PATH + key + '.json?cb=' + cb)
                    .then(function(r) { return r.ok ? r.json() : null; })
                    .catch(function() { return null; });
            })
        );

        ALL_KEYS.forEach(function(key, i) {
            vectoraiAnalyses[key] = analysisResults[i];
        });

        renderVectorAITabContent();

    } catch (e) {
        console.error('Error loading Marmiton HQ data:', e);
        if (container) {
            container.innerHTML = '<div class="alert warn" style="background:rgba(229,72,77,0.08);border:1px solid var(--accent);border-radius:var(--radius);padding:14px 18px;margin-bottom:16px;font-size:0.82rem;color:var(--accent)">' +
                '⚠️ Données non disponibles. Lancez <code>python main.py export</code> pour générer les analyses Marmiton.</div>';
        }
        if (searchGrid) searchGrid.innerHTML = '';
        if (discoverGrid) discoverGrid.innerHTML = '';
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
    renderVectorAICards(SEARCH_KEYS, 'vectorai-search-grid');
    renderVectorAICards(DISCOVER_KEYS, 'vectorai-discover-grid');
}

function renderVectorAIKpis() {
    var fmtFn = typeof fmt !== 'undefined' ? fmt : function(v) { return v; };

    if (vectoraiStats) {
        var qp = document.getElementById('vectorai-kpi-querypairs');
        var disc = document.getElementById('vectorai-kpi-discover');
        if (qp) qp.textContent = fmtFn(vectoraiStats.total_query_pairs || 0);
        if (disc) disc.textContent = fmtFn(vectoraiStats.total_discover_pages || 0);
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

function renderVectorAICards(keys, gridId) {
    var gridEl = document.getElementById(gridId);
    if (!gridEl) return;

    var html = '';
    keys.forEach(function(key) {
        var cfg = ANALYSIS_CONFIG[key];
        var data = vectoraiAnalyses[key];

        if (!data) {
            html += '<div class="analysis-card ' + cfg.cardClass + '" style="opacity:0.5">' +
                '<div class="card-icon">' + cfg.icon + '</div>' +
                '<div class="card-label">' + cfg.label + '</div>' +
                '<div class="card-summary">Analyse non disponible</div></div>';
            return;
        }

        var metricsHtml = (data.key_metrics || []).map(function(m) {
            return '<span class="metric-badge ' + (m.color || 'blue') + '">' + m.label + ': ' + m.value + '</span>';
        }).join('');

        var sourceBadge = cfg.source === 'discover'
            ? '<span class="metric-badge purple">Discover</span>'
            : '<span class="metric-badge blue">Search</span>';

        html += '<div class="analysis-card ' + cfg.cardClass + '" onclick="showAnalysisDetail(\'' + key + '\')">' +
            '<div class="card-icon">' + cfg.icon + '</div>' +
            '<div class="card-label">' + (data.title || cfg.label) + '</div>' +
            '<div class="card-summary">' + (data.summary || 'Cliquez pour voir l\'analyse complète') + '</div>' +
            '<div class="card-metrics">' + sourceBadge + metricsHtml + '</div>' +
            '<div class="card-cta">Voir l\'analyse →</div></div>';
    });

    gridEl.innerHTML = html || '<div class="empty" style="padding:20px;text-align:center;color:var(--muted)">Aucune analyse disponible</div>';
}

function showAnalysisDetail(key) {
    var detailEl = document.getElementById('vectorai-detail');
    var contentEl = document.getElementById('vectorai-detail-content');
    var titleEl = document.getElementById('vectorai-detail-title');
    var metaEl = document.getElementById('vectorai-detail-meta');

    if (!detailEl || !contentEl) return;

    var cfg = ANALYSIS_CONFIG[key];
    var data = vectoraiAnalyses[key];

    if (!data || !data.content_md) {
        detailEl.classList.remove('active');
        return;
    }

    if (titleEl) titleEl.innerHTML = cfg.icon + ' ' + (data.title || cfg.label);

    if (metaEl) {
        var providerName = { gemini: 'Gemini Flash', grok: 'Grok 4.1', claude: 'Claude Opus' };
        var provider = data.provider || (vectoraiMeta ? vectoraiMeta.provider : 'gemini');
        var date = data.generated_at ? new Date(data.generated_at).toLocaleString('fr-FR') : '—';
        var sourceLabel = cfg.source === 'discover' ? 'Discover' : 'Search';
        metaEl.innerHTML = '<span class="provider-badge ' + provider + '">' + (providerName[provider] || provider) + '</span>' +
            '<span class="badge ' + (cfg.source === 'discover' ? 'purple' : 'blue') + '">' + sourceLabel + '</span>' +
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
