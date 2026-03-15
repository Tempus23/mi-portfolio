/**
 * Composition UI Module (SOLID - SRP)
 * Handles the rendering of the portfolio diversification list.
 */

import { AssetIndex } from "../shared/constants.js";
import { store } from "../core/data-store.js";
import { 
    formatCurrency, 
    getAssetTotals,
    getSnapshotMonthsAgo
} from "../shared/portfolio-utils.js";
import { $, setText, escapeHtml } from "../ui/ui-shared.js";
import { selectedCategory } from "../logic/snapshot-manager.js";
import { getWorkingTargets } from "../logic/targets-manager.js";

/**
 * Updates the composition list in the UI.
 */
export function updateCompositionList(compareMonths = 1) {
    const container = $("compositionList");
    if (!container || store.snapshots.length === 0) return;

    const latestSnapshot = store.snapshots[store.snapshots.length - 1];
    const prevSnapshot = getSnapshotMonthsAgo(store.snapshots, latestSnapshot, compareMonths);
    const targetsToUse = getWorkingTargets();
    
    // Default palette for categories if no colors defined
    const palette = [
        "#0071e3", "#32d74b", "#ff9f0a", "#bf5af2",
        "#ff375f", "#64d2ff", "#30d158", "#ff453a",
    ];

    let items = [];
    if (selectedCategory) {
        // Asset-level composition
        const assets = latestSnapshot.assets.filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
        const { value: totalValue } = getAssetTotals({ assets });
        const assetTargets = targetsToUse[selectedCategory]?.assets || {};

        items = assets.sort((a, b) => b[AssetIndex.CURRENT_VALUE] - a[AssetIndex.CURRENT_VALUE]).map((asset, i) => {
            const name = asset[AssetIndex.NAME];
            const val = asset[AssetIndex.CURRENT_VALUE];
            const percent = totalValue > 0 ? (val / totalValue) * 100 : 0;
            
            // Previous month value
            let prevPercent = 0;
            if (prevSnapshot) {
                const prevAssets = prevSnapshot.assets.filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
                const { value: prevTotal } = getAssetTotals({ assets: prevAssets });
                const found = prevAssets.find(a => a[AssetIndex.NAME] === name);
                if (found && prevTotal > 0) {
                    prevPercent = (found[AssetIndex.CURRENT_VALUE] / prevTotal) * 100;
                }
            }

            return {
                label: name,
                percent,
                prevPercent,
                change: prevPercent > 0 ? percent - prevPercent : 0,
                color: palette[i % palette.length],
                targetPercent: assetTargets[name]?.target,
            };
        });
    } else {
        // Category-level composition
        const { value: totalValue } = getAssetTotals(latestSnapshot);
        const categories = Object.keys(latestSnapshot.categoryTotals).sort((a, b) => 
            latestSnapshot.categoryTotals[b] - latestSnapshot.categoryTotals[a]
        );

        items = categories.map((cat, i) => {
            const val = latestSnapshot.categoryTotals[cat];
            const percent = totalValue > 0 ? (val / totalValue) * 100 : 0;
            
            let prevPercent = 0;
            if (prevSnapshot) {
                const { value: prevTotal } = getAssetTotals(prevSnapshot);
                if (prevTotal > 0) {
                    prevPercent = ((prevSnapshot.categoryTotals[cat] || 0) / prevTotal) * 100;
                }
            }

            return {
                label: cat,
                percent,
                prevPercent,
                change: prevPercent > 0 ? percent - prevPercent : 0,
                color: palette[i % palette.length],
                targetPercent: targetsToUse[cat]?.target,
            };
        });
    }

    const hasChange = items.some((item) => Math.abs(item.change) > 0.01);

    container.innerHTML = items
        .map((item) => {
            const changeClass = item.change > 0.05 ? "positive" : item.change < -0.05 ? "negative" : "neutral";
            const arrow = item.change > 0.05 ? "↑" : item.change < -0.05 ? "↓" : "";
            const changeText = !hasChange ? "—" : Math.abs(item.change) < 0.05 ? "=" : `${item.change > 0 ? "+" : ""}${item.change.toFixed(1)}%`;
            const percentText = `${item.percent.toFixed(1)}%`;
            const isSmallPercent = item.percent < 8;
            const target = Number.isFinite(item.targetPercent) ? item.targetPercent : null;
            const targetMarker = target !== null ? `<span class="composition-target-marker" style="left: ${Math.min(Math.max(target, 0), 100)}%"></span>` : "";
            
            return `
            <div class="composition-item">
                <span class="composition-label">${escapeHtml(item.label)}</span>
                <div class="composition-bar-wrapper">
                    <div class="composition-bar composition-bar-previous" style="width: ${item.prevPercent ? Math.max(item.prevPercent, 2) : 0}%; background: ${item.color};"></div>
                    <div class="composition-bar composition-bar-current" style="width: ${Math.max(item.percent, 2)}%; background: ${item.color};">
                        ${isSmallPercent ? "" : `<span class="composition-percent">${percentText}</span>`}
                    </div>
                    ${isSmallPercent ? `<span class="composition-percent-floating" style="left: min(calc(${Math.max(item.percent, 2)}% + 8px), calc(100% - 38px));">${percentText}</span>` : ""}
                    ${item.prevPercent ? `<span class="composition-bar-marker" style="left: ${Math.min(item.prevPercent, 100)}%"></span>` : ""}
                    ${targetMarker}
                </div>
                <span class="composition-change ${changeClass}">
                    <span>${arrow} ${changeText}</span>
                </span>
            </div>
        `;
        })
        .join("");
}
