import { AssetIndex, CATEGORY_COLORS, TERM_COLORS } from '../shared/constants.js';
import { formatCurrency } from '../shared/format.js';

const categoryColors = CATEGORY_COLORS;
const termColors = TERM_COLORS;

export function updateEvolutionChart(chart, snapshotData, state) {
    if (!chart) return;
    const { currentChartMode, evolutionScaleMode, evolutionMinMode, selectedCategory } = state;

    if (snapshotData.length === 0) {
        chart.data.labels = [];
        chart.data.datasets = [];
        chart.update();
        return;
    }

    let datasets = [];
    const latestSnapshot = snapshotData[snapshotData.length - 1];

    if (currentChartMode === 'total') {
        const dataTotal = snapshotData.map(s => {
            if (selectedCategory) {
                const catAssets = s.assets.filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
                const value = catAssets.reduce((sum, a) => sum + a[AssetIndex.CURRENT_VALUE], 0);
                return { x: new Date(s.date).getTime(), y: value };
            }
            return { x: new Date(s.date).getTime(), y: s.totalCurrentValue };
        });

        const dataInvested = snapshotData.map(s => {
            if (selectedCategory) {
                const catAssets = s.assets.filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
                const invested = catAssets.reduce((sum, a) => sum + a[AssetIndex.PURCHASE_VALUE], 0);
                return { x: new Date(s.date).getTime(), y: invested };
            }
            return { x: new Date(s.date).getTime(), y: s.totalPurchaseValue };
        });

        datasets.push({
            label: selectedCategory ? `Valor Actual (${selectedCategory})` : 'Valor Actual Total',
            data: dataTotal,
            borderColor: '#32d74b',
            backgroundColor: '#32d74b20',
            fill: true,
            tension: 0.4,
            pointRadius: 0
        });

        datasets.push({
            label: selectedCategory ? `Invertido (${selectedCategory})` : 'Invertido Total',
            data: dataInvested,
            borderColor: '#ff9f0a',
            backgroundColor: 'transparent',
            borderDash: [5, 5],
            fill: false,
            tension: 0.4,
            pointRadius: 0
        });
        chart.options.scales.y.stacked = false;
    } else if (currentChartMode === 'category') {
        if (selectedCategory) {
            const catAssets = latestSnapshot.assets.filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
            const topAssets = catAssets
                .sort((a, b) => b[AssetIndex.CURRENT_VALUE] - a[AssetIndex.CURRENT_VALUE])
                .slice(0, 5)
                .map(a => a[AssetIndex.NAME]);

            const colors = ['#0071e3', '#32d74b', '#ff9f0a', '#bf5af2', '#ff375f'];
            topAssets.forEach((assetName, i) => {
                datasets.push({
                    label: assetName.length > 20 ? assetName.substring(0, 17) + '...' : assetName,
                    data: snapshotData.map(s => {
                        const found = s.assets.find(a => a[AssetIndex.NAME] === assetName && a[AssetIndex.CATEGORY] === selectedCategory);
                        const value = found ? found[AssetIndex.CURRENT_VALUE] : 0;
                        return { x: new Date(s.date).getTime(), y: value };
                    }),
                    borderColor: colors[i % colors.length],
                    backgroundColor: colors[i % colors.length] + '60',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                });
            });
        } else {
            const sortedCategories = Object.entries(latestSnapshot.categoryTotals)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([cat]) => cat);

            sortedCategories.forEach(cat => {
                datasets.push({
                    label: cat,
                    data: snapshotData.map(s => ({ x: new Date(s.date).getTime(), y: s.categoryTotals[cat] || 0 })),
                    borderColor: categoryColors[cat] || '#888',
                    backgroundColor: (categoryColors[cat] || '#888') + '60',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                });
            });
        }
        const categoryMinZoom = evolutionMinMode === 'min';
        chart.options.scales.y.stacked = !categoryMinZoom;
        if (categoryMinZoom) {
            datasets = datasets.map(ds => ({
                ...ds,
                fill: false,
                pointRadius: 1,
                pointHoverRadius: 3
            }));
        }
    }

    chart.data.labels = [];
    chart.data.datasets = datasets;

    const allValues = datasets.flatMap(ds => (ds.data || []).map(point => point.y));

    if (evolutionScaleMode === 'logarithmic') {
        const positiveValues = allValues.filter(v => v > 0);
        const minPositive = positiveValues.length ? Math.min(...positiveValues) : 1;

        chart.options.scales.y.type = 'logarithmic';
        chart.options.scales.y.min = minPositive * 0.8;
        chart.options.scales.y.beginAtZero = false;
    } else {
        chart.options.scales.y.type = 'linear';
        if (evolutionMinMode === 'min' && allValues.length) {
            const positiveValues = allValues.filter(v => Number.isFinite(v) && v > 0);
            const baseValues = positiveValues.length ? positiveValues : allValues.filter(v => Number.isFinite(v));
            const minValue = baseValues.length ? Math.min(...baseValues) : 0;
            const padding = Math.abs(minValue) * 0.05;
            chart.options.scales.y.min = minValue - padding;
            chart.options.scales.y.beginAtZero = false;
        } else {
            chart.options.scales.y.min = undefined;
            chart.options.scales.y.beginAtZero = true;
        }
    }
    chart.update();
}

export function updateRoiEvolutionChart(chart, snapshotData, monthlyData, state, roiCumulativeByCategoryInput) {
    if (!chart) return;

    if (snapshotData.length === 0) {
        chart.data.labels = [];
        chart.data.datasets = [];
        chart.update();
        return;
    }

    const { currentRoiMode, selectedCategory } = state;
    let roiCumulativeByCategory = state.roiCumulativeByCategory;

    const getValues = (snapshot) => {
        if (selectedCategory) {
            const catAssets = snapshot.assets.filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
            const value = catAssets.reduce((sum, a) => sum + a[AssetIndex.CURRENT_VALUE], 0);
            const invested = catAssets.reduce((sum, a) => sum + a[AssetIndex.PURCHASE_VALUE], 0);
            return { value, invested };
        }
        return { value: snapshot.totalCurrentValue, invested: snapshot.totalPurchaseValue };
    };

    const percentTickFormatter = (value) => (value >= 0 ? '+' : '') + value.toFixed(1) + '%';
    const currencyTickFormatter = (value) => formatCurrency(value);
    const percentTooltipLabel = (context) => {
        const value = context.parsed.y;
        if (context.dataset.yAxisID === 'y1') {
            return context.dataset.label + ': ' + formatCurrency(value);
        }
        return context.dataset.label + ': ' + (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
    };
    const currencyTooltipLabel = (context) => context.dataset.label + ': ' + formatCurrency(context.parsed.y);

    let datasets = [];
    const isBreakdownMode = currentRoiMode === 'breakdown' || currentRoiMode === 'breakdown-period';
    const isCashflowMode = currentRoiMode === 'cashflow';

    if (roiCumulativeByCategoryInput) {
        const canUseByCategory = currentRoiMode === 'cumulative' && !selectedCategory;
        roiCumulativeByCategoryInput.disabled = !canUseByCategory;
        if (!canUseByCategory && roiCumulativeByCategory) {
            roiCumulativeByCategory = false;
        }
        roiCumulativeByCategoryInput.checked = roiCumulativeByCategory;
    }

    if (currentRoiMode === 'cumulative') {
        if (roiCumulativeByCategory && !selectedCategory) {
            const palette = ['#0071e3', '#32d74b', '#ff9f0a', '#bf5af2', '#ff375f', '#64d2ff', '#30d158', '#ff453a'];
            const latestSnapshot = snapshotData.at(-1);
            const categories = Object.entries(latestSnapshot?.categoryTotals || {})
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
                .map(([cat]) => cat);

            datasets = categories.map((cat, index) => {
                const data = snapshotData.map(s => {
                    const catAssets = (s.assets || []).filter(a => a[AssetIndex.CATEGORY] === cat);
                    const value = catAssets.reduce((sum, a) => sum + (a[AssetIndex.CURRENT_VALUE] || 0), 0);
                    const invested = catAssets.reduce((sum, a) => sum + (a[AssetIndex.PURCHASE_VALUE] || 0), 0);
                    const roi = invested > 0 ? ((value - invested) / invested) * 100 : null;
                    return { x: new Date(s.date).getTime(), y: Number.isFinite(roi) ? roi : null };
                });

                return {
                    label: cat,
                    data,
                    borderColor: categoryColors[cat] || palette[index % palette.length],
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.35,
                    pointRadius: 0,
                    pointHoverRadius: 3,
                    yAxisID: 'y'
                };
            }).filter(ds => ds.data.some(point => Number.isFinite(point.y)));

            delete chart.options.scales.y1;
        } else {
            const roiPercent = snapshotData.map(s => {
                const { value, invested } = getValues(s);
                const roi = invested > 0 ? ((value - invested) / invested) * 100 : 0;
                return { x: new Date(s.date).getTime(), y: roi };
            });

            const roiAbsolute = snapshotData.map(s => {
                const { value, invested } = getValues(s);
                return { x: new Date(s.date).getTime(), y: value - invested };
            });

            datasets = [
                {
                    label: selectedCategory ? `ROI % (${selectedCategory})` : 'ROI %',
                    data: roiPercent,
                    borderColor: '#64d2ff',
                    backgroundColor: '#64d2ff20',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 3,
                    yAxisID: 'y'
                },
                {
                    label: selectedCategory ? `ROI Absoluto (${selectedCategory})` : 'ROI Absoluto',
                    data: roiAbsolute,
                    borderColor: '#bf5af2',
                    backgroundColor: 'transparent',
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    yAxisID: 'y1'
                }
            ];

            if (!chart.options.scales.y1) {
                chart.options.scales.y1 = {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { callback: currencyTickFormatter }
                };
            }
        }
        chart.options.scales.y.stacked = false;
        chart.options.scales.y.ticks.callback = percentTickFormatter;
        chart.options.plugins.tooltip.callbacks.label = percentTooltipLabel;

    } else if (currentRoiMode === 'annualized') {
        const annualizedRoiData = snapshotData.map((s, index) => {
            if (index === 0) return { x: new Date(s.date).getTime(), y: 0 };
            const firstSnapshot = snapshotData[0];
            const startDate = new Date(firstSnapshot.date);
            const currentDate = new Date(s.date);
            const years = (currentDate - startDate) / (1000 * 60 * 60 * 24 * 365.25);

            const { value: currentValue, invested: currentInvested } = getValues(s);

            if (years <= 0 || currentInvested <= 0) return { x: new Date(s.date).getTime(), y: 0 };

            const totalRoi = (currentValue - currentInvested) / currentInvested;
            const annualizedRoi = Math.pow(1 + totalRoi, 1 / Math.max(years, 0.01)) - 1;

            return { x: new Date(s.date).getTime(), y: Math.max(-100, Math.min(100, annualizedRoi * 100)) };
        });

        datasets = [{
            label: selectedCategory ? `ROI Anualizado (${selectedCategory})` : 'ROI Anualizado',
            data: annualizedRoiData,
            borderColor: '#ff375f',
            backgroundColor: '#ff375f20',
            fill: true,
            tension: 0.4,
            pointRadius: 0
        }];

        delete chart.options.scales.y1;
        chart.options.scales.y.stacked = false;
        chart.options.scales.y.ticks.callback = percentTickFormatter;
        chart.options.plugins.tooltip.callbacks.label = percentTooltipLabel;

    } else if (isCashflowMode) {
        let periodData = monthlyData;
        if (currentRoiMode !== 'breakdown-period' && snapshotData.length <= 60) {
            periodData = snapshotData;
        }

        const dataArr = [];
        let prevInvested = 0;

        periodData.forEach((s, index) => {
            const { invested } = getValues(s);
            if (index === 0) {
                prevInvested = invested;
                dataArr.push({ x: new Date(s.date).getTime(), y: invested });
                return;
            }
            const flow = invested - prevInvested;
            dataArr.push({ x: new Date(s.date).getTime(), y: flow });
            prevInvested = invested;
        });

        const backgroundColors = dataArr.map(d => d.y >= 0 ? '#32d74b80' : '#ff453a80');
        const borderColors = dataArr.map(d => d.y >= 0 ? '#32d74b' : '#ff453a');

        datasets = [{
            type: 'bar',
            label: selectedCategory ? `Aportaciones (${selectedCategory})` : 'Aportaciones/Retiradas',
            data: dataArr,
            backgroundColor: backgroundColors,
            borderColor: borderColors,
            borderWidth: 1,
            borderRadius: 4
        }];

        delete chart.options.scales.y1;
        chart.options.scales.y.stacked = false;
        chart.options.scales.y.ticks.callback = currencyTickFormatter;
        chart.options.plugins.tooltip.callbacks.label = currencyTooltipLabel;

    } else if (isBreakdownMode) {
        const buildRangeRelativeRoiData = (valueSelector) => {
            let periodData = monthlyData;
            if (currentRoiMode !== 'breakdown-period' && snapshotData.length <= 60) {
                periodData = snapshotData;
            }

            const dataArr = [];
            let lastValue = 0;
            let lastInvested = 0;

            periodData.forEach((s, index) => {
                let currentItemValue = valueSelector(s);
                const { invested: currentInvested } = getValues(s);

                if (index === 0) {
                    lastValue = currentItemValue;
                    lastInvested = currentInvested;
                    dataArr.push({ x: new Date(s.date).getTime(), y: 0 });
                    return;
                }

                if (lastInvested > 0) {
                    const capitalFlow = currentInvested - lastInvested;
                    const valueWithoutFlows = currentItemValue - capitalFlow;
                    const periodRoi = valueWithoutFlows - lastValue;
                    dataArr.push({ x: new Date(s.date).getTime(), y: periodRoi });
                } else {
                    dataArr.push({ x: new Date(s.date).getTime(), y: 0 });
                }

                lastValue = currentItemValue;
                lastInvested = currentInvested;
            });
            return dataArr;
        };

        if (selectedCategory) {
            const latestSnapshot = snapshotData.at(-1);
            const categoryAssets = latestSnapshot.assets.filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
            const topAssets = categoryAssets
                .sort((a, b) => b[AssetIndex.CURRENT_VALUE] - a[AssetIndex.CURRENT_VALUE])
                .slice(0, 5)
                .map(a => a[AssetIndex.NAME]);

            const colors = ['#0071e3', '#32d74b', '#ff9f0a', '#bf5af2', '#ff375f'];

            datasets = topAssets.map((assetName, i) => {
                const data = buildRangeRelativeRoiData(s => {
                    const found = s.assets.find(a => a[AssetIndex.NAME] === assetName && a[AssetIndex.CATEGORY] === selectedCategory);
                    return found ? found[AssetIndex.CURRENT_VALUE] : 0;
                });
                return {
                    type: 'bar',
                    label: assetName.length > 20 ? assetName.substring(0, 17) + '...' : assetName,
                    data,
                    backgroundColor: colors[i % colors.length] + '90',
                    borderColor: colors[i % colors.length],
                    borderWidth: 1
                };
            });
        } else {
            const allCategories = new Set();
            snapshotData.forEach(s => Object.keys(s.categoryTotals || {}).forEach(c => allCategories.add(c)));
            const sortedCategories = Array.from(allCategories).sort((a, b) => a.localeCompare(b));

            datasets = sortedCategories.map(cat => {
                const data = buildRangeRelativeRoiData(s => s.categoryTotals[cat] || 0);
                return {
                    type: 'bar',
                    label: cat,
                    data,
                    backgroundColor: (categoryColors[cat] || '#888') + '90',
                    borderColor: categoryColors[cat] || '#888',
                    borderWidth: 1
                };
            });
        }

        const totalRoiData = buildRangeRelativeRoiData(s => getValues(s).value);
        datasets.push({
            type: 'line',
            label: 'Rentabilidad Total Período',
            data: totalRoiData,
            borderColor: '#ffffff',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 2,
            tension: 0.3,
            fill: false
        });

        delete chart.options.scales.y1;
        chart.options.scales.y.stacked = true;
        chart.options.scales.y.ticks.callback = currencyTickFormatter;
        chart.options.plugins.tooltip.callbacks.label = currencyTooltipLabel;

        const itemSort = (a, b) => {
            if (a.datasetIndex === datasets.length - 1) return -1;
            if (b.datasetIndex === datasets.length - 1) return 1;
            return b.parsed.y - a.parsed.y;
        };
        if (chart.options.plugins.tooltip) {
            chart.options.plugins.tooltip.itemSort = itemSort;
            chart.options.plugins.tooltip.filter = (ctx) => ctx.parsed.y !== 0; // hide 0
        }
    }

    chart.data.labels = [];
    chart.data.datasets = datasets;
    chart.update();
}

export function updateDistributionCharts(chart, snapshotData, state, onCategorySelect) {
    if (!chart) return;

    if (snapshotData.length === 0) {
        chart.data.labels = [];
        chart.data.datasets = [];
        chart.update();
        return;
    }

    const { distributionMode, selectedCategory } = state;
    let finalDatasets = [];

    if (distributionMode === 'category') {
        const allCategories = new Set();
        snapshotData.forEach(s => Object.keys(s.categoryTotals || {}).forEach(cat => allCategories.add(cat)));

        if (selectedCategory) {
            const latestSnapshot = snapshotData.at(-1);
            const categoryAssets = latestSnapshot.assets.filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
            const topAssets = categoryAssets
                .sort((a, b) => b[AssetIndex.CURRENT_VALUE] - a[AssetIndex.CURRENT_VALUE])
                .slice(0, 5)
                .map(a => a[AssetIndex.NAME]);

            const colors = ['#0071e3', '#32d74b', '#ff9f0a', '#bf5af2', '#ff375f'];
            finalDatasets = topAssets.map((assetName, i) => {
                const data = snapshotData.map(s => {
                    const totalCatValue = (s.categoryTotals[selectedCategory] || 1);
                    const found = s.assets.find(a => a[AssetIndex.NAME] === assetName && a[AssetIndex.CATEGORY] === selectedCategory);
                    const value = found ? found[AssetIndex.CURRENT_VALUE] : 0;
                    return { x: new Date(s.date).getTime(), y: (value / totalCatValue) * 100 };
                });

                return {
                    label: assetName.length > 20 ? assetName.substring(0, 17) + '...' : assetName,
                    data: data,
                    borderColor: colors[i % colors.length],
                    backgroundColor: colors[i % colors.length] + '20',
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 3
                };
            });
            chart.options.onClick = null;
        } else {
            const sortedCategories = Array.from(allCategories).sort((a, b) => a.localeCompare(b));
            finalDatasets = sortedCategories.map(cat => {
                const data = snapshotData.map(s => {
                    const totalValue = s.totalCurrentValue || 1;
                    const value = s.categoryTotals[cat] || 0;
                    return { x: new Date(s.date).getTime(), y: (value / totalValue) * 100 };
                });

                return {
                    label: cat,
                    data: data,
                    borderColor: categoryColors[cat] || '#888',
                    backgroundColor: (categoryColors[cat] || '#888') + '20',
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 3
                };
            });
            chart.options.onClick = (evt, elements) => {
                if (elements && elements.length > 0) {
                    const datasetIndex = elements[0].datasetIndex;
                    const category = chart.data.datasets[datasetIndex].label;
                    if (category && onCategorySelect) {
                        onCategorySelect(category);
                    }
                }
            };
        }
    } else if (distributionMode === 'term') {
        const allTerms = new Set();
        snapshotData.forEach(s => Object.keys(s.termTotals || {}).forEach(term => allTerms.add(term)));
        const sortedTerms = Array.from(allTerms).sort((a, b) => a.localeCompare(b));

        if (!selectedCategory) {
            finalDatasets = sortedTerms.map(term => {
                const data = snapshotData.map(s => {
                    const totalValue = s.totalCurrentValue || 1;
                    const value = s.termTotals[term] || 0;
                    return { x: new Date(s.date).getTime(), y: (value / totalValue) * 100 };
                });

                return {
                    label: term,
                    data: data,
                    borderColor: termColors[term] || '#888',
                    backgroundColor: (termColors[term] || '#888') + '20',
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 3
                };
            });
        }
        chart.options.onClick = null;
    }

    const percentTickFormatter = (value) => value.toFixed(1) + '%';
    const percentTooltipLabel = (context) => context.dataset.label + ': ' + context.parsed.y.toFixed(1) + '%';

    if (!chart.options.scales.y) chart.options.scales.y = {};
    chart.options.scales.y.beginAtZero = true;
    chart.options.scales.y.max = undefined;
    if (!chart.options.scales.y.ticks) chart.options.scales.y.ticks = {};
    chart.options.scales.y.ticks.callback = percentTickFormatter;
    if (!chart.options.plugins.tooltip) chart.options.plugins.tooltip = { callbacks: {} };
    if (!chart.options.plugins.tooltip.callbacks) chart.options.plugins.tooltip.callbacks = {};
    chart.options.plugins.tooltip.callbacks.label = percentTooltipLabel;

    chart.data.labels = [];
    chart.data.datasets = finalDatasets;
    chart.update();
}
