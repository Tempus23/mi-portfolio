/**
 * Chart Logic Module (SOLID - SRP)
 * Handles data preparation and configuration for all charts.
 */

import { AssetIndex, CATEGORY_COLORS } from "../shared/constants.js";
import { formatCurrency, getAssetTotals, calculateAnnualizedRoi } from "../shared/portfolio-utils.js";
import { getSnapshotsForChartRange, getMonthlySnapshotsForRange, getSelectedAssets } from "./snapshot-manager.js";
import { escapeHtml } from "../ui/ui-shared.js";

// Chart state
export let currentChartMode = "total"; 
export let currentRoiMode = "cumulative"; 
export let roiCumulativeByCategory = false;
export let evolutionScaleMode = "linear";
export let evolutionMinMode = "zero";
export let currentDistributionMode = "category";

// Helpers
const percentTickFormatter = (value) => value.toFixed(1) + "%";
const percentTooltipLabel = (context) => context.dataset.label + ": " + context.parsed.y.toFixed(1) + "%";
const currencyTickFormatter = (value) => formatCurrency(value);
const currencyTooltipLabel = (context) => context.dataset.label + ": " + formatCurrency(context.parsed.y);

/**
 * Sets the chart modes.
 */
export function setChartModes(modes) {
    if (modes.currentChartMode) currentChartMode = modes.currentChartMode;
    if (modes.currentRoiMode) currentRoiMode = modes.currentRoiMode;
    if (modes.roiCumulativeByCategory !== undefined) roiCumulativeByCategory = modes.roiCumulativeByCategory;
    if (modes.evolutionScaleMode) evolutionScaleMode = modes.evolutionScaleMode;
    if (modes.evolutionMinMode) evolutionMinMode = modes.evolutionMinMode;
    if (modes.currentDistributionMode) currentDistributionMode = modes.currentDistributionMode;
}

/**
 * Updates the main evolution chart.
 */
export function updateEvolutionChart(chart, currentRange, selectedCategory) {
    if (!chart) return;

    const snapshotData = getSnapshotsForChartRange(currentRange);
    if (snapshotData.length === 0) {
        chart.data.labels = [];
        chart.data.datasets = [];
        chart.update();
        return;
    }

    let datasets = [];

    if (currentChartMode === "total") {
        const valueData = snapshotData.map((s) => {
            const { value } = getAssetTotals(s, selectedCategory);
            return { x: new Date(s.date).getTime(), y: value };
        });
        const investedData = snapshotData.map((s) => {
            const { invested } = getAssetTotals(s, selectedCategory);
            return { x: new Date(s.date).getTime(), y: invested };
        });

        datasets = [
            {
                label: selectedCategory || "Valor Total",
                data: valueData,
                borderColor: "#0071e3",
                backgroundColor: "rgba(0, 113, 227, 0.1)",
                fill: true,
                tension: 0.4,
                pointRadius: 0,
            },
            {
                label: selectedCategory ? "Invertido" : "Total Invertido",
                data: investedData,
                borderColor: "#86868b",
                borderDash: [5, 5],
                backgroundColor: "transparent",
                fill: false,
                tension: 0.4,
                pointRadius: 0,
            },
        ];
        chart.options.scales.y.stacked = false;
    } else if (currentChartMode === "category") {
        const latestSnapshot = snapshotData[snapshotData.length - 1];
        if (selectedCategory) {
            const categoryAssets = latestSnapshot.assets.filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
            const topAssets = categoryAssets.sort((a, b) => b[AssetIndex.CURRENT_VALUE] - a[AssetIndex.CURRENT_VALUE]).slice(0, 5);
            const colors = ["#0071e3", "#32d74b", "#ff9f0a", "#bf5af2", "#ff375f"];
            
            datasets = topAssets.map((asset, i) => {
                const assetName = asset[AssetIndex.NAME];
                const data = snapshotData.map((s) => {
                    const found = s.assets.find(a => a[AssetIndex.NAME] === assetName);
                    return { x: new Date(s.date).getTime(), y: found ? found[AssetIndex.CURRENT_VALUE] : 0 };
                });
                return {
                    label: assetName.length > 20 ? assetName.substring(0, 17) + "..." : assetName,
                    data,
                    borderColor: colors[i % colors.length],
                    backgroundColor: colors[i % colors.length] + "60",
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                };
            });
        } else {
            const sortedCategories = Object.entries(latestSnapshot.categoryTotals).sort((a,b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
            sortedCategories.forEach((cat) => {
                datasets.push({
                    label: cat,
                    data: snapshotData.map(s => ({ x: new Date(s.date).getTime(), y: s.categoryTotals[cat] || 0 })),
                    borderColor: CATEGORY_COLORS[cat] || "#888",
                    backgroundColor: (CATEGORY_COLORS[cat] || "#888") + "60",
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                });
            });
        }
        chart.options.scales.y.stacked = evolutionMinMode !== "min";
    }

    chart.data.datasets = datasets;
    
    // Scale handling
    const allValues = datasets.flatMap(ds => ds.data.map(p => p.y));
    if (evolutionScaleMode === "logarithmic") {
        const pos = allValues.filter(v => v > 0);
        chart.options.scales.y.type = "logarithmic";
        chart.options.scales.y.min = (pos.length ? Math.min(...pos) : 1) * 0.8;
    } else {
        chart.options.scales.y.type = "linear";
        if (evolutionMinMode === "min" && allValues.length) {
            const pos = allValues.filter(v => v > 0);
            const min = pos.length ? Math.min(...pos) : 0;
            chart.options.scales.y.min = min * 0.95;
            chart.options.scales.y.beginAtZero = false;
        } else {
            chart.options.scales.y.min = undefined;
            chart.options.scales.y.beginAtZero = true;
        }
    }
    chart.update();
}

/**
 * Updates the ROI evolution chart.
 */
export function updateRoiEvolutionChart(chart, currentRange, selectedCategory) {
    if (!chart) return;
    const snapshotData = getSnapshotsForChartRange(currentRange);
    const monthlyData = getMonthlySnapshotsForRange(currentRange);
    if (snapshotData.length === 0) return;

    let datasets = [];
    const isBreakdownMode = currentRoiMode === "breakdown" || currentRoiMode === "breakdown-period";

    if (currentRoiMode === "cumulative") {
        const data = snapshotData.map(s => {
            const { value, invested } = getAssetTotals(s, selectedCategory);
            const roi = invested > 0 ? ((value - invested) / invested) * 100 : 0;
            return { x: new Date(s.date).getTime(), y: roi };
        });
        datasets = [{
            label: "ROI Acumulado %",
            data,
            borderColor: "#0071e3",
            backgroundColor: "rgba(0, 113, 227, 0.15)",
            fill: true,
            tension: 0.4,
            pointRadius: 0,
        }];
        delete chart.options.scales.y1;
    } else if (currentRoiMode === "annualized") {
        const startDate = new Date(snapshotData[0].date);
        const data = snapshotData.map(s => {
            const { value, invested } = getAssetTotals(s, selectedCategory);
            const roi = calculateAnnualizedRoi(value, invested, startDate, new Date(s.date));
            return { x: new Date(s.date).getTime(), y: roi };
        });
        datasets = [{
            label: "ROI Anualizado %",
            data,
            borderColor: "#0071e3",
            backgroundColor: "rgba(0, 113, 227, 0.15)",
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            yAxisID: "y"
        }];
        delete chart.options.scales.y1;
    } else {
        // Period variations (simplified or full)
        const periodSource = monthlyData.length ? monthlyData : snapshotData;
        const dataPct = periodSource.map((s, i) => {
            const { value, invested } = getAssetTotals(s, selectedCategory);
            if (i === 0) return { x: new Date(s.date).getTime(), y: 0 };
            const prev = periodSource[i - 1];
            const { value: prevValue, invested: prevInvested } = getAssetTotals(prev, selectedCategory);
            const gain = value - prevValue - (invested - prevInvested);
            return { x: new Date(s.date).getTime(), y: prevValue > 0 ? (gain / prevValue) * 100 : 0 };
        });
        
        datasets = [{
            label: "Variación %",
            data: dataPct,
            borderColor: "#0071e3",
            backgroundColor: dataPct.map(p => p.y >= 0 ? "rgba(50, 215, 75, 0.3)" : "rgba(255, 69, 58, 0.3)"),
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            yAxisID: "y"
        }];

        chart.options.scales.y1 = {
            position: "right",
            ticks: { callback: v => formatCurrency(v) }
        };
    }

    // Adjust scales
    chart.options.scales.y.ticks.callback = percentTickFormatter;
    chart.options.plugins.tooltip.callbacks.label = percentTooltipLabel;
    
    chart.data.datasets = datasets;
    chart.update();
}

/**
 * Updates distribution charts.
 */
export function updateDistributionCharts(chart, currentRange, selectedCategory) {
    if (!chart) return;
    const snapshotData = getSnapshotsForChartRange(currentRange);
    if (snapshotData.length === 0) return;

    let datasets = [];
    const latestSnapshot = snapshotData[snapshotData.length - 1];

    if (currentDistributionMode === "category") {
        const categories = Object.keys(latestSnapshot.categoryTotals);
        datasets = categories.map(cat => {
            const data = snapshotData.map(s => {
                const total = s.totalCurrentValue || 1;
                return { x: new Date(s.date).getTime(), y: ((s.categoryTotals[cat] || 0) / total) * 100 };
            });
            return {
                label: cat,
                data,
                borderColor: CATEGORY_COLORS[cat] || "#888",
                backgroundColor: (CATEGORY_COLORS[cat] || "#888") + "20",
                fill: false,
                tension: 0.4,
                pointRadius: 0,
            };
        });
    } else if (currentDistributionMode === "asset") {
        const assetsToShow = getSelectedAssets(latestSnapshot, selectedCategory);
        const topAssets = assetsToShow.sort((a,b) => b[AssetIndex.CURRENT_VALUE] - a[AssetIndex.CURRENT_VALUE]).slice(0, 8);
        const assetColors = ["#0071e3", "#32d74b", "#ff9f0a", "#bf5af2", "#ff375f", "#64d2ff", "#30d158", "#ff6542"];

        datasets = topAssets.map((asset, i) => {
            const name = asset[AssetIndex.NAME];
            const data = snapshotData.map(s => {
                const { value: totalValue } = getAssetTotals(s, selectedCategory);
                const found = getSelectedAssets(s, selectedCategory).find(a => a[AssetIndex.NAME] === name);
                const val = found ? found[AssetIndex.CURRENT_VALUE] : 0;
                return { x: new Date(s.date).getTime(), y: (val / (totalValue || 1)) * 100 };
            });
            return {
                label: name.length > 20 ? name.substring(0, 17) + "..." : name,
                data,
                borderColor: assetColors[i % assetColors.length],
                fill: false,
                tension: 0.4,
                pointRadius: 0,
            };
        });
    }

    chart.data.datasets = datasets;
    chart.options.scales.y.ticks.callback = percentTickFormatter;
    chart.update();
}
