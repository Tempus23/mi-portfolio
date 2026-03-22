// ui/ai-insights.js — AI Insights panel: health score, recommendations, asset signals, AI analysis
import { AssetIndex, CATEGORY_COLORS } from '../shared/constants.js';
import { formatCurrency } from '../shared/format.js';
import { showToast } from '../shared/toast.js';
import { calculateFullAnalytics } from '../core/analytics-engine.js';
import {
    generateRebalancingRecommendations,
    generateConcentrationAlerts,
    generateOptimalContribution,
    generateAssetSignals,
    SIGNAL, SEVERITY
} from '../core/portfolio-analyzer.js';

let _analytics = null;
let _aiResult = null;
let _isLoadingAI = false;
let _lastAnalysisTime = 0;
const AI_COOLDOWN_MS = 30_000;
const AI_STORAGE_KEY = 'portfolio_ai_analysis';

// Load saved AI analysis from localStorage
function loadSavedAnalysis() {
    try {
        const saved = localStorage.getItem(AI_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            _aiResult = parsed.result;
            _lastAnalysisTime = parsed.timestamp || 0;
        }
    } catch (err) {
        console.warn('[AI] Error loading saved analysis:', err);
    }
}

// Save AI analysis to localStorage
function saveAnalysis(result) {
    try {
        localStorage.setItem(AI_STORAGE_KEY, JSON.stringify({
            result,
            timestamp: Date.now()
        }));
    } catch (err) {
        console.warn('[AI] Error saving analysis:', err);
    }
}

// ─── Signal colors / icons ──────────────────────────────────────────────────

const SIGNAL_CONFIG = {
    [SIGNAL.BUY]:    { label: 'Comprar',  icon: '↑', cls: 'signal-buy' },
    [SIGNAL.HOLD]:   { label: 'Mantener', icon: '—', cls: 'signal-hold' },
    [SIGNAL.REDUCE]: { label: 'Reducir',  icon: '↓', cls: 'signal-reduce' },
    [SIGNAL.ALERT]:  { label: 'Alerta',   icon: '⚠', cls: 'signal-alert' },
    [SIGNAL.INFO]:   { label: 'Info',     icon: 'ℹ', cls: 'signal-info' }
};

const SEVERITY_CLS = {
    [SEVERITY.HIGH]: 'severity-high',
    [SEVERITY.MEDIUM]: 'severity-medium',
    [SEVERITY.LOW]: 'severity-low'
};

// ─── Health Score Rendering ─────────────────────────────────────────────────

function getHealthLabel(score) {
    if (score >= 85) return { text: 'Excelente', cls: 'health-excellent' };
    if (score >= 70) return { text: 'Bueno', cls: 'health-good' };
    if (score >= 50) return { text: 'Regular', cls: 'health-fair' };
    if (score >= 30) return { text: 'Mejorable', cls: 'health-poor' };
    return { text: 'Crítico', cls: 'health-critical' };
}

function renderHealthGauge(score) {
    const { text, cls } = getHealthLabel(score);
    const angle = (score / 100) * 180;
    return `
        <div class="health-gauge ${cls}">
            <div class="health-gauge-ring">
                <svg viewBox="0 0 120 70" class="health-svg">
                    <path d="M10 65 A50 50 0 0 1 110 65" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8" stroke-linecap="round"/>
                    <path d="M10 65 A50 50 0 0 1 110 65" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"
                        stroke-dasharray="${(angle / 180) * 157} 157" class="health-arc"/>
                </svg>
                <div class="health-score-number">${Math.round(score)}</div>
            </div>
            <span class="health-label">${text}</span>
        </div>
    `;
}

// ─── Metrics Cards ──────────────────────────────────────────────────────────

function renderMetricsRow(analytics) {
    if (!analytics) return '';
    const items = [
        { label: 'Sharpe', value: analytics.sharpe !== null && Number.isFinite(analytics.sharpe) ? analytics.sharpe.toFixed(2) : '—', icon: '📊', desc: analytics.sharpe === null ? 'Necesita +3 meses' : analytics.sharpe > 1 ? 'Buen riesgo/retorno' : analytics.sharpe > 0 ? 'Aceptable' : 'Negativo' },
        { label: 'Sortino', value: analytics.sortino !== null && Number.isFinite(analytics.sortino) ? analytics.sortino.toFixed(2) : '—', icon: '🛡️', desc: analytics.sortino === null ? 'Necesita +3 meses' : 'Riesgo bajista' },
        { label: 'Vol. Anual', value: `${analytics.annualizedVol.toFixed(1)}%`, icon: '📉', desc: analytics.annualizedVol > 20 ? 'Alta' : analytics.annualizedVol > 10 ? 'Media' : 'Baja' },
        { label: 'CAGR', value: analytics.cagr !== null ? `${analytics.cagr.toFixed(1)}%` : '—', icon: '📈', desc: analytics.cagr !== null && Math.abs(analytics.cagr) > 100 ? 'Poco fiable (historial corto)' : 'Crecimiento anualizado' },
        { label: 'Diversificación', value: analytics.diversificationRatio !== null && Number.isFinite(analytics.diversificationRatio) ? analytics.diversificationRatio.toFixed(2) : '—', icon: '🎯', desc: analytics.diversificationRatio > 1.2 ? 'Buena' : analytics.diversificationRatio !== null ? 'Mejorable' : 'Datos insuficientes' },
        { label: 'HHI', value: analytics.hhi.toFixed(0), icon: '⚖️', desc: analytics.hhi > 2500 ? 'Concentrado' : analytics.hhi > 1500 ? 'Moderado' : 'Diversificado' }
    ];

    return `
        <div class="ai-metrics-row">
            ${items.map(item => `
                <div class="ai-metric-card">
                    <span class="ai-metric-icon">${item.icon}</span>
                    <span class="ai-metric-value">${item.value}</span>
                    <span class="ai-metric-label">${item.label}</span>
                    <span class="ai-metric-desc">${item.desc}</span>
                </div>
            `).join('')}
        </div>
    `;
}

// ─── Recommendations ────────────────────────────────────────────────────────

function renderRecommendations(recs, alerts) {
    const allItems = [...(recs || []), ...(alerts || [])];
    if (!allItems.length) return '<p class="ai-empty">Sin recomendaciones por ahora.</p>';

    allItems.sort((a, b) => {
        const sevOrder = { high: 0, medium: 1, low: 2 };
        return (sevOrder[a.severity] || 2) - (sevOrder[b.severity] || 2);
    });

    return `
        <div class="ai-recommendations">
            ${allItems.slice(0, 8).map(rec => {
                const sigCfg = SIGNAL_CONFIG[rec.signal] || SIGNAL_CONFIG[SIGNAL.INFO];
                const sevCls = SEVERITY_CLS[rec.severity] || '';
                return `
                    <div class="ai-rec-item ${sigCfg.cls} ${sevCls}">
                        <span class="ai-rec-icon">${sigCfg.icon}</span>
                        <div class="ai-rec-content">
                            <span class="ai-rec-title">${escapeHtml(rec.category || rec.asset || '')}</span>
                            <span class="ai-rec-text">${escapeHtml(rec.message)}</span>
                        </div>
                        <span class="ai-rec-badge">${sigCfg.label}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// ─── Asset Signals ──────────────────────────────────────────────────────────

function renderAssetSignals(signals) {
    if (!signals || !signals.length) return '';
    const top = signals.slice(0, 12);
    return `
        <div class="ai-signals-section">
            <h4 class="ai-subsection-title">Señales por Activo</h4>
            <div class="ai-signals-grid">
                ${top.map(s => {
                    const cfg = SIGNAL_CONFIG[s.signal] || SIGNAL_CONFIG[SIGNAL.HOLD];
                    const displayName = s.asset || s.name || '';
                    return `
                        <div class="ai-signal-chip ${cfg.cls}">
                            <span class="ai-signal-name">${escapeHtml(displayName.length > 16 ? displayName.slice(0, 13) + '...' : displayName)}</span>
                            <span class="ai-signal-icon">${cfg.icon}</span>
                            <span class="ai-signal-label">${cfg.label}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// ─── Monte Carlo ────────────────────────────────────────────────────────────

function renderMonteCarlo(mc) {
    if (!mc) return '';
    return `
        <div class="ai-montecarlo">
            <h4 class="ai-subsection-title">Proyección Monte Carlo (12 meses)</h4>
            <div class="montecarlo-grid">
                <div class="mc-scenario mc-pessimistic">
                    <span class="mc-label">Pesimista (P10)</span>
                    <span class="mc-value">${formatCurrency(mc.percentile10)}</span>
                </div>
                <div class="mc-scenario mc-median">
                    <span class="mc-label">Mediana (P50)</span>
                    <span class="mc-value">${formatCurrency(mc.median)}</span>
                </div>
                <div class="mc-scenario mc-optimistic">
                    <span class="mc-label">Optimista (P90)</span>
                    <span class="mc-value">${formatCurrency(mc.percentile90)}</span>
                </div>
            </div>
        </div>
    `;
}

// ─── AI Analysis (GPT) ─────────────────────────────────────────────────────

function renderAIAnalysis(result) {
    if (!result) return `
        <div class="ai-gpt-section">
            <p class="ai-empty">Pulsa "Analizar con IA" para obtener un análisis personalizado.</p>
        </div>
    `;

    return `
        <div class="ai-gpt-section">
            ${result.healthSummary ? `<div class="ai-gpt-block"><p>${escapeHtml(result.healthSummary)}</p></div>` : ''}
            ${result.recommendations?.length ? `
                <div class="ai-gpt-block">
                    <h5>💡 Recomendaciones IA</h5>
                    <ul class="ai-gpt-list">
                        ${result.recommendations.map(r => {
                            const urgencyIcon = r.urgency === 'high' ? '🔴' : r.urgency === 'medium' ? '🟡' : '🟢';
                            const title = r.title || r.action || '';
                            const detail = r.detail || r.reason || '';
                            return `<li>${urgencyIcon} <strong>${escapeHtml(title)}</strong>: ${escapeHtml(detail)}</li>`;
                        }).join('')}
                    </ul>
                </div>
            ` : ''}
            ${result.monthlyPlan ? `
                <div class="ai-gpt-block">
                    <h5>📅 Plan Mensual</h5>
                    <p>${escapeHtml(result.monthlyPlan.summary || result.monthlyPlan)}</p>
                    ${result.monthlyPlan.breakdown?.length ? `
                        <ul class="ai-gpt-list">
                            ${result.monthlyPlan.breakdown.map(b => `<li><strong>${escapeHtml(b.category)}</strong>: ${escapeHtml(b.amount)}€ — ${escapeHtml(b.reason)}</li>`).join('')}
                        </ul>
                    ` : ''}
                </div>
            ` : ''}
            ${result.risks?.length ? `
                <div class="ai-gpt-block">
                    <h5>⚠️ Riesgos</h5>
                    <ul class="ai-gpt-list">${result.risks.map(r => {
                        const levelIcon = r.level === 'high' ? '🔴' : r.level === 'medium' ? '🟡' : '🟢';
                        const desc = r.description || r;
                        return `<li>${levelIcon} ${escapeHtml(desc)}</li>`;
                    }).join('')}</ul>
                </div>
            ` : ''}
            ${result.outlook ? `
                <div class="ai-gpt-block">
                    <h5>🔮 Perspectiva</h5>
                    <p>${escapeHtml(result.outlook)}</p>
                </div>
            ` : ''}
            ${result.targetAnalysis ? `
                <div class="ai-gpt-block">
                    <h5>🎯 Análisis de Objetivos</h5>
                    <p>${escapeHtml(result.targetAnalysis)}</p>
                </div>
            ` : ''}
            ${result.cashAllocation ? `
                <div class="ai-gpt-block">
                    <h5>💵 Uso del Cash Disponible</h5>
                    <p>${escapeHtml(result.cashAllocation)}</p>
                </div>
            ` : ''}
            ${result.sellSuggestions?.length ? `
                <div class="ai-gpt-block">
                    <h5>📉 Activos a Considerar Vender</h5>
                    <ul class="ai-gpt-list">
                        ${result.sellSuggestions.map(s => `<li><strong>${escapeHtml(s.asset || '')}</strong>: ${escapeHtml(s.reason || s)}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        </div>
    `;
}

// ─── Portfolio Context for AI ───────────────────────────────────────────────

export function buildPortfolioContext(snapshots, targets, targetsMeta, analytics) {
    if (!snapshots.length) return null;
    const latest = snapshots[snapshots.length - 1];
    const totalValue = latest.totalCurrentValue || 0;

    const categories = Object.keys(latest.categoryTotals || {}).map(cat => {
        const value = latest.categoryTotals[cat] || 0;
        const invested = latest.categoryInvested?.[cat] || 0;
        const weight = totalValue > 0 ? ((value / totalValue) * 100) : 0;
        const roi = invested > 0 ? (((value - invested) / invested) * 100) : 0;
        const target = targets?.[cat]?.target ?? null;

        const catAssets = latest.assets.filter(a => a[AssetIndex.CATEGORY] === cat);
        const assets = catAssets.map(a => ({
            name: a[AssetIndex.NAME],
            term: a[AssetIndex.TERM],
            value: a[AssetIndex.CURRENT_VALUE],
            invested: a[AssetIndex.PURCHASE_VALUE],
            weight: totalValue > 0 ? (a[AssetIndex.CURRENT_VALUE] / totalValue * 100) : 0,
            roi: a[AssetIndex.PURCHASE_VALUE] > 0
                ? (((a[AssetIndex.CURRENT_VALUE] - a[AssetIndex.PURCHASE_VALUE]) / a[AssetIndex.PURCHASE_VALUE]) * 100)
                : 0
        }));

        return { category: cat, value, invested, weight, roi, target, assets };
    });

    const history = snapshots.slice(-6).map(s => ({
        date: new Date(s.date).toLocaleDateString('es-ES'),
        value: s.totalCurrentValue || 0,
        invested: s.totalPurchaseValue || 0
    }));

    return {
        date: new Date(latest.date).toLocaleDateString('es-ES'),
        totalValue,
        totalInvested: latest.totalPurchaseValue || 0,
        totalRoi: latest.totalPurchaseValue > 0
            ? (((totalValue - latest.totalPurchaseValue) / latest.totalPurchaseValue) * 100)
            : 0,
        monthlyBudget: targetsMeta?.monthlyBudget || 0,
        assetCount: latest.assets.length,
        categoryCount: categories.length,
        categories,
        history,
        analytics: analytics ? {
            healthScore: analytics.healthScore,
            sharpe: analytics.sharpe,
            sortino: analytics.sortino,
            annualizedVol: analytics.annualizedVol,
            maxDrawdown: analytics.maxDrawdown?.maxDrawdown || 0,
            cagr: analytics.cagr,
            hhi: analytics.hhi,
            diversificationRatio: analytics.diversificationRatio,
            avgTargetDeviation: analytics.avgTargetDeviation
        } : null
    };
}

// ─── AI Fetch ───────────────────────────────────────────────────────────────

async function fetchAIAnalysis(portfolioContext) {
    const now = Date.now();
    if (_isLoadingAI || now - _lastAnalysisTime < AI_COOLDOWN_MS) return;
    _isLoadingAI = true;

    const btn = document.getElementById('aiAnalyzeBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Analizando...';
    }

    try {
        const response = await fetch('/api/finanzas/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ portfolioSummary: portfolioContext })
        });

        if (!response.ok) {
            throw new Error(await getErrorMessage(response, `HTTP ${response.status}`));
        }
        const data = await response.json();
        _aiResult = data.analysis || data;
        _lastAnalysisTime = Date.now();
        saveAnalysis(_aiResult);

        const aiContainer = document.getElementById('aiGptContent');
        if (aiContainer) aiContainer.innerHTML = renderAIAnalysis(_aiResult);
        showToast('Análisis IA completado', 'success');
    } catch (err) {
        console.error('[AI] Error:', err);
        const message = err instanceof Error ? err.message : 'Error al obtener análisis IA';
        showToast(message, 'error');
    } finally {
        _isLoadingAI = false;
        if (btn) {
            btn.disabled = false;
            btn.textContent = '🧠 Analizar con IA';
        }
    }
}

async function getErrorMessage(response, fallbackMessage) {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
        try {
            const body = await response.json();
            if (typeof body?.error === 'string' && body.error.trim()) {
                return body.error;
            }
        } catch {
            // Keep fallback message.
        }
    }

    if (response.status === 401 || response.status === 403) {
        return 'Acceso denegado. Inicia sesión mediante Cloudflare Access.';
    }

    return fallbackMessage;
}

// ─── Main Render ────────────────────────────────────────────────────────────

function escapeHtml(value) {
    const text = String(value ?? '');
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

export function initAIInsights() {
    // AI analysis button event
    document.addEventListener('click', (e) => {
        if (e.target.id === 'aiAnalyzeBtn' || e.target.closest('#aiAnalyzeBtn')) {
            const ctx = window.__portfolioContext;
            if (ctx) fetchAIAnalysis(ctx);
            else showToast('No hay datos de portfolio para analizar', 'error');
        }
    });
}

export function updateAIInsights(snapshots, targets, targetsMeta, monthlySnapshots) {
    const container = document.getElementById('aiInsightsContent');
    if (!container || !snapshots.length) {
        if (container) container.innerHTML = '<p class="ai-empty">Captura al menos un snapshot para ver insights.</p>';
        return;
    }

    // Load saved AI analysis if not already loaded
    if (!_aiResult && !_lastAnalysisTime) {
        loadSavedAnalysis();
    }

    // Calculate full analytics
    _analytics = calculateFullAnalytics(snapshots, targets, targetsMeta);
    if (!_analytics) return;

    const latest = snapshots[snapshots.length - 1];

    // Local analysis
    const recs = generateRebalancingRecommendations(latest, targets, targetsMeta);
    const alerts = generateConcentrationAlerts(latest, _analytics.hhi);
    const contributionsResult = generateOptimalContribution(latest, targets, targetsMeta, _analytics.categoryAnalytics);
    const contributionRecs = contributionsResult?.breakdown?.map(c => ({
        signal: c.gap > 2 ? SIGNAL.BUY : c.gap < -2 ? SIGNAL.REDUCE : SIGNAL.HOLD,
        severity: Math.abs(c.gap) > 5 ? SEVERITY.HIGH : Math.abs(c.gap) > 2 ? SEVERITY.MEDIUM : SEVERITY.LOW,
        category: c.category,
        message: `Aportar ${formatCurrency(c.amount)}/mes (${c.percentOfBudget.toFixed(0)}% del presupuesto). Gap: ${c.gap >= 0 ? '+' : ''}${c.gap.toFixed(1)}pp`
    })) || [];
    const signals = generateAssetSignals(latest, monthlySnapshots || snapshots, targets);

    // Save context for AI button
    window.__portfolioContext = buildPortfolioContext(snapshots, targets, targetsMeta, _analytics);

    // Render
    container.innerHTML = `
        <div class="ai-insights-grid">
            <div class="ai-insights-left">
                ${renderHealthGauge(_analytics.healthScore)}
                ${renderMonteCarlo(_analytics.monteCarlo)}
            </div>
            <div class="ai-insights-right">
                ${renderMetricsRow(_analytics)}
                ${renderRecommendations([...recs, ...contributionRecs], alerts)}
            </div>
        </div>
        ${renderAssetSignals(signals)}
        <div class="ai-gpt-wrapper">
            <div class="ai-gpt-header">
                <div>
                    <h4>🧠 Análisis IA</h4>
                    ${_lastAnalysisTime ? `<small style="opacity: 0.7; font-size: 0.85rem;">Último análisis: ${new Date(_lastAnalysisTime).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</small>` : ''}
                </div>
                <button class="btn primary" id="aiAnalyzeBtn">🧠 ${_aiResult ? 'Actualizar' : 'Analizar'}</button>
            </div>
            <div id="aiGptContent">
                ${renderAIAnalysis(_aiResult)}
            </div>
        </div>
    `;
}

export function getAnalytics() {
    return _analytics;
}
