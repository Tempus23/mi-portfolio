// core/analytics-engine.js — Enhanced analytics: Sharpe, Sortino, correlation, Monte Carlo, etc.

import { AssetIndex } from '../shared/constants.js';

// ─── Risk-free rate (EUR bonds approximate) ─────────────────────────────────
const ANNUAL_RISK_FREE_RATE = 0.035; // 3.5% EUR
const MONTHLY_RISK_FREE_RATE = Math.pow(1 + ANNUAL_RISK_FREE_RATE, 1 / 12) - 1;

// ─── Utility ────────────────────────────────────────────────────────────────

function mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr) {
    if (arr.length < 2) return 0;
    const avg = mean(arr);
    const variance = arr.reduce((sum, v) => sum + (v - avg) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
}

function downsideDeviation(returns, threshold = 0) {
    const downReturns = returns.filter(r => r < threshold).map(r => (r - threshold) ** 2);
    if (!downReturns.length) return 0;
    return Math.sqrt(downReturns.reduce((a, b) => a + b, 0) / returns.length);
}

// ─── Core Analytics Functions ───────────────────────────────────────────────

/**
 * Calculate monthly returns from snapshots, adjusting for new contributions.
 */
export function calcMonthlyReturns(monthlySnapshots, categoryFilter = null) {
    const returns = [];
    for (let i = 1; i < monthlySnapshots.length; i++) {
        const prev = monthlySnapshots[i - 1];
        const curr = monthlySnapshots[i];

        let prevVal, prevInv, currVal, currInv;
        if (categoryFilter) {
            const prevAssets = prev.assets.filter(a => a[AssetIndex.CATEGORY] === categoryFilter);
            const currAssets = curr.assets.filter(a => a[AssetIndex.CATEGORY] === categoryFilter);
            prevVal = prevAssets.reduce((s, a) => s + a[AssetIndex.CURRENT_VALUE], 0);
            prevInv = prevAssets.reduce((s, a) => s + a[AssetIndex.PURCHASE_VALUE], 0);
            currVal = currAssets.reduce((s, a) => s + a[AssetIndex.CURRENT_VALUE], 0);
            currInv = currAssets.reduce((s, a) => s + a[AssetIndex.PURCHASE_VALUE], 0);
        } else {
            prevVal = prev.totalCurrentValue;
            prevInv = prev.totalPurchaseValue;
            currVal = curr.totalCurrentValue;
            currInv = curr.totalPurchaseValue;
        }

        if (prevVal > 0) {
            const newContribution = currInv - prevInv;
            const gain = currVal - prevVal - newContribution;
            returns.push(gain / prevVal);
        }
    }
    return returns;
}

/**
 * Sharpe Ratio (annualized).
 * = (mean monthly excess return) / (monthly std) * sqrt(12)
 */
export function calcSharpeRatio(monthlyReturns) {
    if (monthlyReturns.length < 3) return null;
    const excessReturns = monthlyReturns.map(r => r - MONTHLY_RISK_FREE_RATE);
    const avgExcess = mean(excessReturns);
    const std = stddev(excessReturns);
    if (std === 0) return avgExcess > 0 ? Infinity : 0;
    return (avgExcess / std) * Math.sqrt(12);
}

/**
 * Sortino Ratio (annualized).
 * Like Sharpe but only penalizes downside volatility.
 */
export function calcSortinoRatio(monthlyReturns) {
    if (monthlyReturns.length < 3) return null;
    const excessReturns = monthlyReturns.map(r => r - MONTHLY_RISK_FREE_RATE);
    const avgExcess = mean(excessReturns);
    const downDev = downsideDeviation(excessReturns, 0);
    if (downDev === 0) return avgExcess > 0 ? Infinity : 0;
    return (avgExcess / downDev) * Math.sqrt(12);
}

/**
 * Max Drawdown from a series of values.
 */
export function calcMaxDrawdown(values) {
    if (!values || values.length < 2) return { maxDrawdown: 0, peakDate: null, troughDate: null };
    let peak = values[0].value;
    let peakIdx = 0;
    let maxDd = 0;
    let ddPeakIdx = 0;
    let ddTroughIdx = 0;

    for (let i = 1; i < values.length; i++) {
        if (values[i].value > peak) {
            peak = values[i].value;
            peakIdx = i;
        }
        const dd = peak > 0 ? (values[i].value - peak) / peak : 0;
        if (dd < maxDd) {
            maxDd = dd;
            ddPeakIdx = peakIdx;
            ddTroughIdx = i;
        }
    }

    return {
        maxDrawdown: maxDd * 100,
        peakDate: values[ddPeakIdx]?.date || null,
        troughDate: values[ddTroughIdx]?.date || null
    };
}

/**
 * Annualized Volatility from monthly returns.
 */
export function calcAnnualizedVolatility(monthlyReturns) {
    if (monthlyReturns.length < 2) return 0;
    return stddev(monthlyReturns) * Math.sqrt(12) * 100;
}

/**
 * Correlation matrix between categories.
 * Returns { categories: string[], matrix: number[][] }
 */
export function calcCorrelationMatrix(monthlySnapshots, categories) {
    if (monthlySnapshots.length < 4 || categories.length < 2) return null;

    const returnsByCategory = {};
    categories.forEach(cat => {
        returnsByCategory[cat] = calcMonthlyReturns(monthlySnapshots, cat);
    });

    // Trim to common length
    const minLen = Math.min(...categories.map(c => returnsByCategory[c].length));
    if (minLen < 3) return null;

    categories.forEach(cat => {
        returnsByCategory[cat] = returnsByCategory[cat].slice(-minLen);
    });

    const matrix = categories.map(catA => {
        return categories.map(catB => {
            if (catA === catB) return 1;
            return pearsonCorrelation(returnsByCategory[catA], returnsByCategory[catB]);
        });
    });

    return { categories, matrix };
}

function pearsonCorrelation(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 3) return 0;
    const mx = mean(x.slice(0, n));
    const my = mean(y.slice(0, n));
    let num = 0, dx2 = 0, dy2 = 0;
    for (let i = 0; i < n; i++) {
        const dx = x[i] - mx;
        const dy = y[i] - my;
        num += dx * dy;
        dx2 += dx * dx;
        dy2 += dy * dy;
    }
    const denom = Math.sqrt(dx2 * dy2);
    return denom > 0 ? num / denom : 0;
}

/**
 * Effective Diversification Ratio.
 * = weighted average volatility / portfolio volatility
 * A ratio > 1 means diversification is adding value.
 */
export function calcDiversificationRatio(monthlySnapshots, categories, latestSnapshot) {
    if (monthlySnapshots.length < 4 || categories.length < 2) return null;

    const totalValue = latestSnapshot.totalCurrentValue || 1;
    const weights = categories.map(cat => (latestSnapshot.categoryTotals[cat] || 0) / totalValue);
    const vols = categories.map(cat => {
        const returns = calcMonthlyReturns(monthlySnapshots, cat);
        return stddev(returns) * Math.sqrt(12);
    });

    const weightedAvgVol = weights.reduce((sum, w, i) => sum + w * vols[i], 0);
    const portfolioReturns = calcMonthlyReturns(monthlySnapshots);
    const portfolioVol = stddev(portfolioReturns) * Math.sqrt(12);

    if (portfolioVol === 0) return weightedAvgVol > 0 ? Infinity : 1;
    return weightedAvgVol / portfolioVol;
}

/**
 * Monte Carlo Simulation (simplified).
 * Projects portfolio value at 1, 3, and 5 years using historical return/volatility.
 * Returns percentiles: p10, p50, p90 for each horizon.
 */
export function calcMonteCarloProjection(currentValue, monthlyReturns, monthlyContribution = 0) {
    if (monthlyReturns.length < 3 || currentValue <= 0) return null;

    const mu = mean(monthlyReturns);
    const sigma = stddev(monthlyReturns);
    const horizons = [12, 36, 60]; // months
    const numSimulations = 1000;
    const results = {};

    for (const months of horizons) {
        const finalValues = [];
        for (let sim = 0; sim < numSimulations; sim++) {
            let value = currentValue;
            for (let m = 0; m < months; m++) {
                // Geometric Brownian Motion approximation
                const randomReturn = mu + sigma * gaussianRandom();
                value = value * (1 + randomReturn) + monthlyContribution;
                if (value < 0) value = 0;
            }
            finalValues.push(value);
        }
        finalValues.sort((a, b) => a - b);
        results[months] = {
            p10: finalValues[Math.floor(numSimulations * 0.1)],
            p25: finalValues[Math.floor(numSimulations * 0.25)],
            p50: finalValues[Math.floor(numSimulations * 0.5)],
            p75: finalValues[Math.floor(numSimulations * 0.75)],
            p90: finalValues[Math.floor(numSimulations * 0.9)]
        };
    }

    return results;
}

// Box-Muller transform for standard normal random variable
function gaussianRandom() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Concentration Risk: Herfindahl-Hirschman Index (HHI).
 * HHI ranges 0-10000. Below 1500 = diversified. Above 2500 = concentrated.
 */
export function calcConcentrationHHI(weights) {
    return weights.reduce((sum, w) => sum + (w * 100) ** 2, 0);
}

/**
 * CAGR (Compound Annual Growth Rate)
 */
export function calcCAGR(startValue, endValue, years) {
    if (startValue <= 0 || years <= 0) return 0;
    return (Math.pow(endValue / startValue, 1 / years) - 1);
}

/**
 * Portfolio Health Score (0-100).
 * Composite score based on:
 * - Diversification (25 pts)
 * - Target alignment (25 pts)
 * - Risk-adjusted return (25 pts)
 * - Consistency (25 pts)
 */
export function calcHealthScore({ sharpe, diversificationRatio, targetDeviation, monthlyReturns, hhi }) {
    let score = 0;

    // 1. Diversification (25 pts) — based on HHI and diversification ratio
    if (hhi !== null && hhi !== undefined) {
        if (hhi < 1500) score += 25;
        else if (hhi < 2500) score += 15;
        else if (hhi < 4000) score += 8;
        else score += 3;
    }
    if (diversificationRatio !== null && diversificationRatio > 1.2) score += Math.min(5, (diversificationRatio - 1) * 10);

    // 2. Target alignment (25 pts) — average absolute deviation from target
    if (targetDeviation !== null && targetDeviation !== undefined) {
        if (targetDeviation < 3) score += 25;
        else if (targetDeviation < 8) score += 18;
        else if (targetDeviation < 15) score += 10;
        else score += 3;
    } else {
        score += 12; // No targets = neutral
    }

    // 3. Risk-adjusted return (25 pts) — based on Sharpe
    if (sharpe !== null && sharpe !== undefined && Number.isFinite(sharpe)) {
        if (sharpe > 1.5) score += 25;
        else if (sharpe > 1.0) score += 20;
        else if (sharpe > 0.5) score += 15;
        else if (sharpe > 0) score += 10;
        else score += 3;
    } else {
        score += 10;
    }

    // 4. Consistency (25 pts) — win rate of monthly returns
    if (monthlyReturns && monthlyReturns.length >= 3) {
        const positiveMonths = monthlyReturns.filter(r => r > 0).length;
        const winRate = positiveMonths / monthlyReturns.length;
        score += Math.round(winRate * 25);
    } else {
        score += 10;
    }

    return Math.min(100, Math.max(0, Math.round(score)));
}

/**
 * Calculate comprehensive analytics for the portfolio.
 */
export function calculateFullAnalytics(snapshots, targets, targetsMeta) {
    if (!snapshots.length) return null;

    const latest = snapshots[snapshots.length - 1];
    const categories = Object.keys(latest.categoryTotals || {});
    const totalValue = latest.totalCurrentValue;

    // Monthly snapshots
    const monthlyMap = new Map();
    snapshots.forEach(s => {
        const d = new Date(s.date);
        monthlyMap.set(`${d.getFullYear()}-${d.getMonth()}`, s);
    });
    const monthly = Array.from(monthlyMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date));

    // Returns
    const monthlyReturns = calcMonthlyReturns(monthly);
    const sharpe = calcSharpeRatio(monthlyReturns);
    const sortino = calcSortinoRatio(monthlyReturns);
    const annualizedVol = calcAnnualizedVolatility(monthlyReturns);

    // Drawdown
    const valuesSeries = monthly.map(s => ({ value: s.totalCurrentValue, date: s.date }));
    const drawdownInfo = calcMaxDrawdown(valuesSeries);

    // Correlation
    const correlationMatrix = calcCorrelationMatrix(monthly, categories);

    // Diversification
    const diversificationRatio = calcDiversificationRatio(monthly, categories, latest);

    // Concentration
    const weights = categories.map(cat => (latest.categoryTotals[cat] || 0) / (totalValue || 1));
    const hhi = calcConcentrationHHI(weights);

    // Target deviation
    let avgTargetDeviation = null;
    if (targets && Object.keys(targets).length > 0) {
        const deviations = categories.map(cat => {
            const currentPct = totalValue > 0 ? ((latest.categoryTotals[cat] || 0) / totalValue * 100) : 0;
            const target = targets[cat]?.target ?? null;
            return target !== null ? Math.abs(currentPct - target) : null;
        }).filter(d => d !== null);
        if (deviations.length > 0) {
            avgTargetDeviation = mean(deviations);
        }
    }

    // Monte Carlo
    const monthlyContribution = targetsMeta?.monthlyBudget || 0;
    const monteCarlo = calcMonteCarloProjection(totalValue, monthlyReturns, monthlyContribution);

    // Health Score
    const healthScore = calcHealthScore({
        sharpe,
        diversificationRatio,
        targetDeviation: avgTargetDeviation,
        monthlyReturns,
        hhi
    });

    // CAGR — require at least 3 months for a meaningful annualized figure
    let cagr = null;
    if (snapshots.length >= 2) {
        const first = snapshots[0];
        const years = (new Date(latest.date) - new Date(first.date)) / (365.25 * 24 * 60 * 60 * 1000);
        if (years >= 0.25 && first.totalPurchaseValue > 0) {
            cagr = calcCAGR(first.totalPurchaseValue, totalValue, years) * 100;
            // Cap to avoid misleading values from short periods
            cagr = Math.max(-99, Math.min(cagr, 500));
        }
    }

    // Category analytics
    const categoryAnalytics = categories.map(cat => {
        const catReturns = calcMonthlyReturns(monthly, cat);
        const catVol = calcAnnualizedVolatility(catReturns);
        const catSharpe = calcSharpeRatio(catReturns);
        const catValues = monthly.map(s => {
            const assets = s.assets.filter(a => a[AssetIndex.CATEGORY] === cat);
            return { value: assets.reduce((sum, a) => sum + a[AssetIndex.CURRENT_VALUE], 0), date: s.date };
        });
        const catDd = calcMaxDrawdown(catValues);
        const currentPct = totalValue > 0 ? ((latest.categoryTotals[cat] || 0) / totalValue * 100) : 0;
        const target = targets?.[cat]?.target ?? null;

        return {
            category: cat,
            weight: currentPct,
            target,
            deviation: target !== null ? currentPct - target : null,
            volatility: catVol,
            sharpe: catSharpe,
            maxDrawdown: catDd.maxDrawdown,
            monthlyReturns: catReturns
        };
    });

    return {
        // Portfolio-level
        healthScore,
        sharpe,
        sortino,
        annualizedVol,
        maxDrawdown: drawdownInfo,
        cagr,
        hhi,
        diversificationRatio,
        avgTargetDeviation,
        monteCarlo,
        monthlyReturns,

        // Category-level
        correlationMatrix,
        categoryAnalytics,

        // Meta
        totalValue,
        totalInvested: latest.totalPurchaseValue,
        totalRoi: latest.totalPurchaseValue > 0
            ? ((totalValue - latest.totalPurchaseValue) / latest.totalPurchaseValue * 100)
            : 0,
        snapshotCount: snapshots.length,
        monthlyCount: monthly.length
    };
}
