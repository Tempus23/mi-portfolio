export function createLineChartOptions(formatCurrency) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false
        },
        plugins: {
            legend: {
                display: true,
                position: 'top',
                labels: {
                    color: '#a1a1a6',
                    font: { family: '-apple-system, BlinkMacSystemFont, sans-serif', size: 12 },
                    usePointStyle: true,
                    padding: 16
                }
            },
            tooltip: {
                backgroundColor: 'rgba(45, 45, 47, 0.95)',
                titleColor: '#f5f5f7',
                bodyColor: '#a1a1a6',
                borderColor: 'rgba(255, 255, 255, 0.12)',
                borderWidth: 1,
                padding: 12,
                cornerRadius: 10,
                callbacks: {
                    label: function (context) {
                        return context.dataset.label + ': ' + formatCurrency(context.parsed.y);
                    }
                }
            },
            datalabels: { display: false }
        },
        scales: {
            x: {
                type: 'time',
                time: {
                    tooltipFormat: 'dd MMM yyyy',
                    displayFormats: {
                        day: 'd MMM',
                        month: 'MMM yy'
                    }
                },
                grid: { color: 'rgba(255, 255, 255, 0.04)' },
                ticks: { color: '#6e6e73', font: { size: 11 } }
            },
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.04)' },
                ticks: {
                    color: '#6e6e73',
                    font: { size: 11 },
                    callback: value => formatCurrency(value)
                },
                beginAtZero: true
            }
        }
    };
}

export function createDoughnutOptions(formatCurrency) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    color: '#a1a1a6',
                    font: { family: '-apple-system, BlinkMacSystemFont, sans-serif', size: 12 },
                    usePointStyle: true,
                    padding: 14,
                    boxWidth: 10,
                    boxHeight: 10
                }
            },
            tooltip: {
                backgroundColor: 'rgba(45, 45, 47, 0.95)',
                titleColor: '#f5f5f7',
                bodyColor: '#a1a1a6',
                cornerRadius: 10,
                callbacks: {
                    label: function (context) {
                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                        const percentage = ((context.raw / total) * 100).toFixed(1);
                        return `${context.label}: ${formatCurrency(context.raw)} (${percentage}%)`;
                    }
                }
            },
            datalabels: {
                color: '#fff',
                font: {
                    family: '-apple-system, BlinkMacSystemFont, sans-serif',
                    weight: '600',
                    size: 11
                },
                formatter: (value, ctx) => {
                    const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                    const percentage = ((value / total) * 100).toFixed(0);
                    return percentage >= 5 ? percentage + '%' : '';
                }
            }
        },
        cutout: '48%'
    };
}

export function createRoiChartOptions(formatCurrency) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false
        },
        plugins: {
            legend: {
                display: true,
                position: 'top',
                labels: {
                    color: '#a1a1a6',
                    font: { family: '-apple-system, BlinkMacSystemFont, sans-serif', size: 12 },
                    usePointStyle: true,
                    padding: 16
                }
            },
            tooltip: {
                backgroundColor: 'rgba(45, 45, 47, 0.95)',
                titleColor: '#f5f5f7',
                bodyColor: '#a1a1a6',
                cornerRadius: 10,
                callbacks: {
                    label: function (context) {
                        const value = context.parsed.y;
                        if (context.dataset.yAxisID === 'y1') {
                            return context.dataset.label + ': ' + formatCurrency(value);
                        }
                        return context.dataset.label + ': ' + (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
                    }
                }
            },
            datalabels: { display: false }
        },
        scales: {
            x: {
                type: 'time',
                time: {
                    tooltipFormat: 'dd MMM yyyy',
                    displayFormats: {
                        day: 'd MMM',
                        month: 'MMM yy'
                    }
                },
                grid: { color: 'rgba(255, 255, 255, 0.04)' },
                ticks: { color: '#6e6e73', font: { size: 11 } }
            },
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.04)' },
                ticks: {
                    color: '#6e6e73',
                    font: { size: 11 },
                    callback: value => (value >= 0 ? '+' : '') + value.toFixed(1) + '%'
                },
                beginAtZero: true
            }
        }
    };
}
