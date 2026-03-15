/**
 * Analytics Core Module (SOLID - SRP)
 * Handles financial calculations, KPIs, and performance analysis.
 */

import { AssetIndex } from "../shared/constants.js";
import { store } from "../core/data-store.js";
import {
    formatCurrency,
    getAssetTotals
} from "../shared/portfolio-utils.js";
import { $, setText, escapeHtml } from "../ui/ui-shared.js";
import { selectedCategory, getSnapshotsForRange, getMonthlySnapshotsForRange } from "./snapshot-manager.js";

/**
 * Updates the analytics KPIs and insights in the UI.
 */
export function updateAnalytics(currentRange) {
    if (store.snapshots.length === 0) return;

    const latestSnapshot = store.snapshots[store.snapshots.length - 1];
    const rangeSnapshots = getSnapshotsForRange(currentRange);
    const monthlyData = getMonthlySnapshotsForRange(currentRange);

    let assetsToAnalyze, totalValue, totalPurchase;

    if (selectedCategory) {
        assetsToAnalyze = latestSnapshot.assets.filter(
            (a) => a[AssetIndex.CATEGORY] === selectedCategory,
        );
        const totals = getAssetTotals({ assets: assetsToAnalyze });
        totalValue = totals.value;
        totalPurchase = totals.invested;
    } else {
        assetsToAnalyze = null;
        totalValue = latestSnapshot.totalCurrentValue;
        totalPurchase = latestSnapshot.totalPurchaseValue;
    }

    // 1. Max Drawdown
    let peakRoi = -Infinity;
    let maxDrawdown = 0;

    monthlyData.forEach((s) => {
        let val, invested;
        if (selectedCategory) {
            const catAssets = (s.assets || []).filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
            const totals = getAssetTotals({ assets: catAssets });
            val = totals.value;
            invested = totals.invested;
        } else {
            val = s.totalCurrentValue;
            invested = s.totalPurchaseValue;
        }
        const roi = invested > 0 ? ((val - invested) / invested) * 100 : 0;
        if (roi > peakRoi) peakRoi = roi;
        const drawdown = roi - peakRoi;
        if (drawdown < maxDrawdown) maxDrawdown = drawdown;
    });

    const drawdownEl = $("maxDrawdown");
    if (drawdownEl) {
        drawdownEl.textContent = maxDrawdown.toFixed(2) + "%";
        drawdownEl.className = "kpi-value " + (maxDrawdown < -5 ? "negative" : "");
    }

    // 2. Best/Worst Item & Win Rate
    let bestItem = { name: "-", roi: -Infinity };
    let worstItem = { name: "-", roi: Infinity };
    let profitableCount = 0;
    let totalItems = 0;

    if (selectedCategory) {
        assetsToAnalyze.forEach((a) => {
            const invested = a[AssetIndex.PURCHASE_VALUE];
            const current = a[AssetIndex.CURRENT_VALUE];
            const roi = invested > 0 ? (current - invested) / invested : 0;
            if (roi > bestItem.roi) bestItem = { name: a[AssetIndex.NAME], roi };
            if (roi < worstItem.roi) worstItem = { name: a[AssetIndex.NAME], roi };
            if (roi >= 0) profitableCount++;
            totalItems++;
        });
    } else {
        const categories = Object.keys(latestSnapshot.categoryTotals);
        categories.forEach((cat) => {
            const catAssets = latestSnapshot.assets.filter(a => a[AssetIndex.CATEGORY] === cat);
            const totals = getAssetTotals({ assets: catAssets });
            const roi = totals.invested > 0 ? (totals.value - totals.invested) / totals.invested : 0;
            if (roi > bestItem.roi) bestItem = { name: cat, roi };
            if (roi < worstItem.roi) worstItem = { name: cat, roi };
            if (roi >= 0) profitableCount++;
            totalItems++;
        });
    }

    const winRate = totalItems > 0 ? (profitableCount / totalItems) * 100 : 0;

    setText("bestAsset", bestItem.name.length > 15 ? bestItem.name.substring(0, 12) + "..." : bestItem.name);
    const bestRoiEl = $("bestAssetRoi");
    if (bestRoiEl) {
        bestRoiEl.textContent = (bestItem.roi * 100).toFixed(1) + "% ROI";
        bestRoiEl.className = "kpi-desc " + (bestItem.roi >= 0 ? "positive" : "negative");
    }

    const worstAssetEl = $("worstAsset");
    if (worstAssetEl) {
        worstAssetEl.textContent = worstItem.name.length > 15 ? worstItem.name.substring(0, 12) + "..." : worstItem.name;
        const worstRoiEl = $("worstAssetRoi");
        if (worstRoiEl) {
            worstRoiEl.textContent = (worstItem.roi * 100).toFixed(1) + "% ROI";
            worstRoiEl.className = "kpi-desc " + (worstItem.roi >= 0 ? "positive" : "negative");
        }
    }

    const winRateEl = $("winRate");
    if (winRateEl) {
        winRateEl.textContent = winRate.toFixed(0) + "%";
        winRateEl.className = "kpi-value " + (winRate >= 50 ? "positive" : "negative");
    }

    // 3. CAGR & Projected Value
    let cagr = 0.07;
    if (rangeSnapshots.length >= 2) {
        const firstSnapshot = rangeSnapshots[0];
        const firstDate = new Date(firstSnapshot.date);
        const lastDate = new Date(latestSnapshot.date);
        const years = (lastDate - firstDate) / (1000 * 60 * 60 * 24 * 365);

        if (years > 0.01 && firstSnapshot.totalPurchaseValue > 0) {
            const totalReturn = latestSnapshot.totalCurrentValue / firstSnapshot.totalPurchaseValue;
            cagr = Math.pow(totalReturn, 1 / years) - 1;
            cagr = Math.max(-0.5, Math.min(cagr, 1));
        }
    }

    const projected = latestSnapshot.totalCurrentValue * (1 + cagr);
    setText("projectedValue", formatCurrency(projected));
    const cagrEl = $("projectedCagr");
    if (cagrEl) {
        cagrEl.textContent = `CAGR: ${(cagr * 100).toFixed(1)}%`;
        cagrEl.className = "kpi-desc " + (cagr >= 0 ? "positive" : "negative");
    }

    // 4. Annualized Volatility
    const periodReturns = monthlyData.map((s, i) => {
        const totals = getAssetTotals(s);
        if (i === 0) return 0;
        const prev = monthlyData[i - 1];
        const prevTotals = getAssetTotals(prev);
        const newInvestment = totals.invested - prevTotals.invested;
        const actualGain = totals.value - prevTotals.value - newInvestment;
        return prevTotals.value > 0 ? (actualGain / prevTotals.value) * 100 : 0;
    });

    const validReturns = periodReturns.slice(1).filter((v) => Number.isFinite(v));
    const avg = validReturns.length ? validReturns.reduce((a, b) => a + b, 0) / validReturns.length : 0;
    const variance = validReturns.length ? validReturns.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / validReturns.length : 0;
    const monthlyStd = Math.sqrt(variance);
    const annualizedVol = monthlyStd * Math.sqrt(12);

    setText("volatility", annualizedVol.toFixed(1) + "%");
}

/**
 * Updates the opportunities/rebalancing suggestions in the UI.
 */
export function updateOpportunities() {
    const list = $("opportunitiesList");
    if (!list) return;

    if (store.snapshots.length === 0) {
        list.innerHTML = '<li class="empty-state">No hay datos suficientes</li>';
        return;
    }

    const latestSnapshot = store.snapshots[store.snapshots.length - 1];
    const categories = Object.keys(latestSnapshot.categoryTotals);
    const totalValue = latestSnapshot.totalCurrentValue || 1;

    const opportunities = categories
        .map((cat) => {
            const val = latestSnapshot.categoryTotals[cat] || 0;
            const pct = (val / totalValue) * 100;
            const target = store.targets[cat]?.target || 0;
            const diff = target - pct;
            return { cat, diff, pct, target };
        })
        .filter((o) => o.diff > 2)
        .sort((a, b) => b.diff - a.diff);

    if (opportunities.length === 0) {
        list.innerHTML = '<li class="empty-state">Tu cartera está bien balanceada</li>';
        return;
    }

    list.innerHTML = opportunities
        .map(
            (o) => `
        <li class="opportunity-item">
            <div class="opportunity-info">
                <strong>Infraponderado: ${escapeHtml(o.cat)}</strong>
                <p>Está al ${o.pct.toFixed(1)}% (Objetivo: ${o.target.toFixed(1)}%)</p>
            </div>
            <div class="opportunity-action">
                Falta un <strong>${o.diff.toFixed(1)}%</strong>
            </div>
        </li>
    `,
        )
        .join("");
}
