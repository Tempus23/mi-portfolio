// core/portfolio-analyzer.js — Local portfolio analysis: recommendations, alerts, rebalancing
// Runs client-side for instant feedback, complements the AI analysis

import { AssetIndex, CATEGORY_COLORS } from '../shared/constants.js';
import { formatCurrency } from '../shared/format.js';

// ─── Recommendation Types ───────────────────────────────────────────────────

const SIGNAL = {
    BUY: 'buy',
    HOLD: 'hold',
    REDUCE: 'reduce',
    ALERT: 'alert',
    INFO: 'info'
};

const SEVERITY = {
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low'
};

// ─── Analysis Functions ─────────────────────────────────────────────────────

/**
 * Generate rebalancing recommendations based on targets.
 */
export function generateRebalancingRecommendations(latestSnapshot, targets, targetsMeta) {
    if (!latestSnapshot || !targets || !Object.keys(targets).length) return [];

    const totalValue = latestSnapshot.totalCurrentValue || 1;
    const categories = Object.keys(latestSnapshot.categoryTotals || {});
    const budget = targetsMeta?.monthlyBudget || 0;

    const recs = [];

    categories.forEach(cat => {
        const currentValue = latestSnapshot.categoryTotals[cat] || 0;
        const currentPct = (currentValue / totalValue) * 100;
        const target = targets[cat]?.target;
        if (target === null || target === undefined) return;

        const deviation = currentPct - target;
        const absDeviation = Math.abs(deviation);

        if (absDeviation < 2) return; // Within tolerance

        const targetValue = totalValue * (target / 100);
        const gapValue = targetValue - currentValue;

        if (deviation < -5) {
            // Significantly underweight
            recs.push({
                type: SIGNAL.BUY,
                severity: absDeviation > 10 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
                category: cat,
                message: `${cat} está un ${absDeviation.toFixed(1)}% por debajo del objetivo (${currentPct.toFixed(1)}% vs ${target}%)`,
                detail: `Necesitas invertir ~${formatCurrency(Math.abs(gapValue))} para alcanzar el objetivo`,
                actionAmount: Math.abs(gapValue),
                deviation
            });
        } else if (deviation > 5) {
            // Significantly overweight
            recs.push({
                type: SIGNAL.REDUCE,
                severity: absDeviation > 10 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
                category: cat,
                message: `${cat} está un ${absDeviation.toFixed(1)}% por encima del objetivo (${currentPct.toFixed(1)}% vs ${target}%)`,
                detail: `Considerar reducir ~${formatCurrency(Math.abs(gapValue))} o dejar de aportar temporalmente`,
                actionAmount: Math.abs(gapValue),
                deviation
            });
        } else if (absDeviation >= 2) {
            recs.push({
                type: deviation < 0 ? SIGNAL.BUY : SIGNAL.HOLD,
                severity: SEVERITY.LOW,
                category: cat,
                message: `${cat}: desviación moderada (${deviation > 0 ? '+' : ''}${deviation.toFixed(1)}%)`,
                detail: deviation < 0
                    ? `Priorizar en el próximo aporte mensual`
                    : `Mantener sin aportar hasta que reequilibre`,
                actionAmount: Math.abs(gapValue),
                deviation
            });
        }
    });

    return recs.sort((a, b) => {
        const severityOrder = { high: 0, medium: 1, low: 2 };
        return (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2);
    });
}

/**
 * Generate concentration alerts.
 */
export function generateConcentrationAlerts(latestSnapshot, hhi) {
    if (!latestSnapshot) return [];
    const alerts = [];
    const totalValue = latestSnapshot.totalCurrentValue || 1;

    // HHI-based alert
    if (hhi > 4000) {
        alerts.push({
            type: SIGNAL.ALERT,
            severity: SEVERITY.HIGH,
            message: 'Portfolio muy concentrado',
            detail: `El índice de concentración HHI es ${Math.round(hhi)}. Considera diversificar en más categorías.`
        });
    } else if (hhi > 2500) {
        alerts.push({
            type: SIGNAL.ALERT,
            severity: SEVERITY.MEDIUM,
            message: 'Concentración moderada',
            detail: `HHI: ${Math.round(hhi)}. Podrías beneficiarte de mayor diversificación.`
        });
    }

    // Single asset concentration
    const topAssets = [...latestSnapshot.assets]
        .sort((a, b) => b[AssetIndex.CURRENT_VALUE] - a[AssetIndex.CURRENT_VALUE])
        .slice(0, 3);

    topAssets.forEach(asset => {
        const weight = (asset[AssetIndex.CURRENT_VALUE] / totalValue) * 100;
        if (weight > 30) {
            alerts.push({
                type: SIGNAL.ALERT,
                severity: SEVERITY.HIGH,
                message: `${asset[AssetIndex.NAME]} representa el ${weight.toFixed(1)}% del portfolio`,
                detail: 'Riesgo de concentración excesiva en un solo activo. Considera reducir posición.'
            });
        } else if (weight > 20) {
            alerts.push({
                type: SIGNAL.ALERT,
                severity: SEVERITY.MEDIUM,
                message: `${asset[AssetIndex.NAME]} representa el ${weight.toFixed(1)}% del portfolio`,
                detail: 'Posición relevante. Monitorizar para evitar sobreexposición.'
            });
        }
    });

    return alerts;
}

/**
 * Generate optimal next monthly contribution breakdown.
 */
export function generateOptimalContribution(latestSnapshot, targets, targetsMeta, categoryAnalytics = []) {
    if (!latestSnapshot || !targets || !Object.keys(targets).length) return null;

    const budget = targetsMeta?.monthlyBudget || 0;
    if (budget <= 0) return null;

    const totalValue = latestSnapshot.totalCurrentValue || 1;
    const categories = Object.keys(latestSnapshot.categoryTotals || {});
    const hardness = targetsMeta?.adjustmentHardness ?? 0.5;

    // Score each category: higher = needs more contribution
    const scored = categories.map(cat => {
        const currentPct = ((latestSnapshot.categoryTotals[cat] || 0) / totalValue) * 100;
        const target = targets[cat]?.target ?? 0;
        const gap = target - currentPct; // positive = underweight
        const catAnalytics = categoryAnalytics.find(c => c.category === cat);
        const vol = catAnalytics?.volatility ?? 0;
        const sharpe = catAnalytics?.sharpe ?? 0;

        // Base allocation proportional to target
        const sumTargets = categories.reduce((s, c) => s + (targets[c]?.target ?? 0), 0) || 1;
        const baseAllocation = (target / sumTargets) * budget;

        // Gap adjustment: shift allocation towards underweight categories
        const gapBoost = gap * hardness * (budget / 100);

        // Risk-adjusted boost: slightly favor categories with better risk/return
        const riskBoost = Number.isFinite(sharpe) && sharpe > 0 ? sharpe * 5 : 0;

        const suggested = Math.max(0, baseAllocation + gapBoost + riskBoost);

        return { category: cat, target, currentPct, gap, suggested, baseAllocation };
    });

    // Normalize to budget
    const totalSuggested = scored.reduce((s, c) => s + c.suggested, 0) || 1;
    const normalized = scored.map(c => ({
        ...c,
        amount: (c.suggested / totalSuggested) * budget,
        percentOfBudget: (c.suggested / totalSuggested) * 100
    }));

    return {
        budget,
        breakdown: normalized.sort((a, b) => b.amount - a.amount)
    };
}

/**
 * Generate per-asset signals (buy/hold/reduce).
 */
export function generateAssetSignals(latestSnapshot, monthlySnapshots, targets) {
    if (!latestSnapshot || monthlySnapshots.length < 3) return [];

    const totalValue = latestSnapshot.totalCurrentValue || 1;
    const signals = [];

    latestSnapshot.assets.forEach(asset => {
        const name = asset[AssetIndex.NAME];
        const category = asset[AssetIndex.CATEGORY];
        const currentValue = asset[AssetIndex.CURRENT_VALUE];
        const purchaseValue = asset[AssetIndex.PURCHASE_VALUE];
        const weight = (currentValue / totalValue) * 100;
        const roi = purchaseValue > 0 ? ((currentValue - purchaseValue) / purchaseValue * 100) : 0;

        // Trend analysis: compare value over last few months
        const recentValues = monthlySnapshots.slice(-4).map(s => {
            const found = s.assets.find(a =>
                a[AssetIndex.NAME] === name && a[AssetIndex.CATEGORY] === category
            );
            return found ? found[AssetIndex.CURRENT_VALUE] : 0;
        });

        let trend = 'neutral';
        if (recentValues.length >= 3) {
            const recent = recentValues.slice(-2);
            const older = recentValues.slice(0, -2);
            const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
            const olderAvg = older.reduce((a, b) => a + b, 0) / (older.length || 1);
            if (olderAvg > 0) {
                const change = (recentAvg - olderAvg) / olderAvg;
                if (change > 0.05) trend = 'up';
                else if (change < -0.05) trend = 'down';
            }
        }

        // Target alignment for the category
        const categoryTarget = targets?.[category]?.target;
        const categoryCurrentPct = totalValue > 0
            ? ((latestSnapshot.categoryTotals[category] || 0) / totalValue * 100) : 0;
        const categoryUnderweight = categoryTarget !== undefined && categoryTarget !== null
            ? categoryTarget - categoryCurrentPct : 0;

        // Determine signal
        let signal = SIGNAL.HOLD;
        let reason = 'Mantener posición actual';

        if (roi < -20 && trend === 'down') {
            signal = SIGNAL.ALERT;
            reason = `Pérdida del ${Math.abs(roi).toFixed(1)}% con tendencia bajista. Evaluar si mantener.`;
        } else if (categoryUnderweight > 5 && trend !== 'down') {
            signal = SIGNAL.BUY;
            reason = `Categoría infraponderada (${categoryUnderweight.toFixed(1)}% debajo del objetivo)${trend === 'up' ? ' con tendencia positiva' : ''}.`;
        } else if (categoryUnderweight < -5) {
            signal = SIGNAL.REDUCE;
            reason = `Categoría sobreponderada (${Math.abs(categoryUnderweight).toFixed(1)}% por encima del objetivo).`;
        } else if (roi > 50 && weight > 15) {
            signal = SIGNAL.HOLD;
            reason = `Gran rendimiento (+${roi.toFixed(1)}%) y peso relevante (${weight.toFixed(1)}%). Considerar tomar ganancias parciales.`;
        } else if (trend === 'up' && categoryUnderweight > 0) {
            signal = SIGNAL.BUY;
            reason = `Tendencia alcista y categoría ligeramente infraponderada.`;
        }

        signals.push({ name, category, weight, roi, trend, signal, reason, currentValue });
    });

    return signals.sort((a, b) => {
        const order = { alert: 0, buy: 1, reduce: 2, hold: 3, info: 4 };
        return (order[a.signal] ?? 4) - (order[b.signal] ?? 4);
    });
}

export { SIGNAL, SEVERITY };
