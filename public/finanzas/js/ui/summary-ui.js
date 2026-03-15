/**
 * Summary UI Module (SOLID - SRP)
 * Handles the rendering of the portfolio summary metrics.
 */

import { AssetIndex } from "../shared/constants.js";
import { store } from "../core/data-store.js";
import { 
    formatCurrency, 
    getPreviousMonthSnapshot,
    getYearStartSnapshot,
    getSnapshotMonthsAgo
} from "../shared/portfolio-utils.js";
import { $, setText } from "../ui/ui-shared.js";
import * as SnapshotManager from "../logic/snapshot-manager.js";

/**
 * Updates the summary metrics in the UI.
 */
export function updateSummary() {
    const latestSnapshot = store.snapshots[store.snapshots.length - 1];
    const previousSnapshot = getPreviousMonthSnapshot(store.snapshots, latestSnapshot);
    const firstSnapshot = store.snapshots[0];
    const selectedCategory = SnapshotManager.selectedCategory;

    if (latestSnapshot) {
        let totalValue, totalPurchase, variation, prevValue, prevInvested;

        if (selectedCategory) {
            const totals = SnapshotManager.getAssetTotals(latestSnapshot);
            totalValue = totals.value;
            totalPurchase = totals.invested;
            variation = totalValue - totalPurchase;

            if (previousSnapshot) {
                const prevTotals = SnapshotManager.getAssetTotals(previousSnapshot);
                prevValue = prevTotals.value;
                prevInvested = prevTotals.invested;
            }
        } else {
            totalValue = latestSnapshot.totalCurrentValue;
            totalPurchase = latestSnapshot.totalPurchaseValue;
            variation = totalValue - totalPurchase;
            prevValue = previousSnapshot ? previousSnapshot.totalCurrentValue : null;
            prevInvested = previousSnapshot ? previousSnapshot.totalPurchaseValue : null;
        }

        setText("totalValue", formatCurrency(totalValue));

        let roi = totalPurchase > 0 ? (variation / totalPurchase) * 100 : 0;
        let periodGain = variation;
        if (previousSnapshot && prevValue != null) {
            const newInvestment = totalPurchase - (prevInvested || 0);
            periodGain = totalValue - prevValue - newInvestment;
            roi = prevValue > 0 ? (periodGain / prevValue) * 100 : 0;
        }

        const accumRoi = totalPurchase > 0 ? ((totalValue - totalPurchase) / totalPurchase) * 100 : 0;
        const totalRoiAccumEl = $("totalRoiAccum");
        if (totalRoiAccumEl) {
            totalRoiAccumEl.textContent = (accumRoi >= 0 ? "+" : "") + accumRoi.toFixed(2) + "%";
            totalRoiAccumEl.className = "metric-value " + (accumRoi >= 0 ? "positive" : "negative");
        }

        const lastMonthInvestedEl = $("lastMonthInvested");
        if (lastMonthInvestedEl) {
            if (previousSnapshot && prevInvested != null) {
                const lastInvestment = totalPurchase - prevInvested;
                const arrow = lastInvestment >= 0 ? "↑" : "↓";
                lastMonthInvestedEl.textContent = `${arrow} ${formatCurrency(Math.abs(lastInvestment))}`;
                lastMonthInvestedEl.className = "metric-change " + (lastInvestment >= 0 ? "positive" : "negative");
            } else {
                lastMonthInvestedEl.textContent = "";
                lastMonthInvestedEl.className = "metric-change";
            }
        }

        const changeIndicator = $("valueChangeIndicator");
        const currentProfit = totalValue - totalPurchase;
        if (changeIndicator && firstSnapshot) {
            changeIndicator.textContent = `${currentProfit >= 0 ? "↑" : "↓"} ${formatCurrency(Math.abs(currentProfit))}`;
            changeIndicator.className = "change-indicator " + (currentProfit >= 0 ? "positive" : "negative");
        }

        const setComparison = (el, snapshot) => {
            if (!el) return;
            const totals = SnapshotManager.getAssetTotals(snapshot);
            if (!totals || !snapshot) {
                el.textContent = "—";
                el.className = "comparison-value";
                return;
            }
            const profit = totals.value - totals.invested;
            const change = currentProfit - profit;
            el.textContent = `${change >= 0 ? "+" : "-"}${formatCurrency(Math.abs(change))}`;
            el.className = "comparison-value " + (change >= 0 ? "positive" : "negative");
        };

        setComparison($("compareStart"), getYearStartSnapshot(store.snapshots, latestSnapshot));
        setComparison($("compareMonth"), previousSnapshot);
        setComparison($("compareYear"), getSnapshotMonthsAgo(store.snapshots, latestSnapshot, 12));
    } else {
        setText("totalValue", "0,00 €");
        setText("totalRoiAccum", "0,00%");
        setText("lastMonthInvested", "— vs mes anterior");
        setText("compareStart", "—");
        setText("compareMonth", "—");
        setText("compareYear", "—");
    }
}
