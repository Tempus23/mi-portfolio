import {
    createLineChartOptions,
    createRoiChartOptions
} from '../shared/chart-options.js';

let evolutionChart = null;
let roiEvolutionChart = null;
let distributionChart = null;

export function initCharts(formatCurrency) {
    const evolutionCtx = document.getElementById('evolutionChart')?.getContext('2d');
    if (evolutionCtx) {
        evolutionChart = new Chart(evolutionCtx, {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: createLineChartOptions(formatCurrency)
        });
    }

    const roiCtx = document.getElementById('roiEvolutionChart')?.getContext('2d');
    if (roiCtx) {
        roiEvolutionChart = new Chart(roiCtx, {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: createRoiChartOptions(formatCurrency)
        });
    }

    const distCanvas = document.getElementById('distributionChart');
    if (distCanvas) {
        distributionChart = new Chart(distCanvas.getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: createLineChartOptions(formatCurrency)
        });
    }

    return { evolutionChart, roiEvolutionChart, distributionChart };
}

export function getEvolutionChart() { return evolutionChart; }
export function getRoiEvolutionChart() { return roiEvolutionChart; }
export function getDistributionChart() { return distributionChart; }
