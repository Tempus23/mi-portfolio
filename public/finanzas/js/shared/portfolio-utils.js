import { AssetIndex } from './constants.js';

export function calculateSnapshotMetrics(snapshot) {
    const assets = snapshot.assets || [];

    const totalCurrentValue = assets.reduce((sum, a) => sum + a[AssetIndex.CURRENT_VALUE], 0);
    const totalPurchaseValue = assets.reduce((sum, a) => sum + a[AssetIndex.PURCHASE_VALUE], 0);
    const variation = totalCurrentValue - totalPurchaseValue;

    const categoryTotals = {};
    const categoryInvested = {};
    const termTotals = {};

    assets.forEach(asset => {
        const category = asset[AssetIndex.CATEGORY];
        const term = asset[AssetIndex.TERM];
        const currentValue = asset[AssetIndex.CURRENT_VALUE];
        const purchaseValue = asset[AssetIndex.PURCHASE_VALUE];

        categoryTotals[category] = (categoryTotals[category] || 0) + currentValue;
        categoryInvested[category] = (categoryInvested[category] || 0) + purchaseValue;
        termTotals[term] = (termTotals[term] || 0) + currentValue;
    });

    return {
        ...snapshot,
        totalCurrentValue,
        totalPurchaseValue,
        variation,
        categoryTotals,
        categoryInvested,
        termTotals
    };
}

export function migrateToArrays(oldSnapshots) {
    return oldSnapshots.map(snapshot => {
        const newAssets = snapshot.assets.map(asset => ([
            asset.name,
            asset.term,
            asset.category,
            asset.purchasePrice,
            asset.quantity,
            asset.currentPrice,
            asset.purchaseValue,
            asset.currentValue
        ]));

        return { ...snapshot, assets: newAssets };
    });
}

export function cloneDeep(value) {
    return JSON.parse(JSON.stringify(value || {}));
}

export function normalizeObjectives(targetsData = {}) {
    const normalized = {};

    Object.keys(targetsData)
        .sort((a, b) => a.localeCompare(b, 'es'))
        .forEach(category => {
            const categoryData = targetsData[category] || {};
            const assets = categoryData.assets || {};
            const normalizedAssets = {};

            Object.keys(assets)
                .sort((a, b) => a.localeCompare(b, 'es'))
                .forEach(assetName => {
                    const target = Number(assets[assetName]?.target);
                    normalizedAssets[assetName] = Number.isFinite(target) ? target : 0;
                });

            const categoryTarget = Number(categoryData.target);
            normalized[category] = {
                target: Number.isFinite(categoryTarget) ? categoryTarget : 0,
                assets: normalizedAssets
            };
        });

    return normalized;
}

export function hasObjectiveChanges(originalTargets, draftTargets) {
    const originalSignature = JSON.stringify(normalizeObjectives(originalTargets));
    const draftSignature = JSON.stringify(normalizeObjectives(draftTargets));
    return originalSignature !== draftSignature;
}

export function addMonths(date, months) {
    const value = new Date(date);
    value.setMonth(value.getMonth() + months);
    return value;
}

export function buildTargetEditPolicy({
    lastObjectiveUpdateAt,
    now = new Date(),
    lockMonths = 3,
    windowHours = 24
}) {
    if (!lastObjectiveUpdateAt) {
        return {
            canEdit: true,
            lockMessage: 'Objetivos editables',
            shouldStartNewWindow: true,
            nextUnlockDate: null
        };
    }

    const lastUpdate = new Date(lastObjectiveUpdateAt);
    if (!Number.isFinite(lastUpdate.getTime())) {
        return {
            canEdit: true,
            lockMessage: 'Objetivos editables',
            shouldStartNewWindow: true,
            nextUnlockDate: null
        };
    }

    const windowEnd = new Date(lastUpdate.getTime() + windowHours * 60 * 60 * 1000);
    const nextUnlockDate = addMonths(lastUpdate, lockMonths);
    const inCurrentWindow = now <= windowEnd;

    return {
        canEdit: true,
        lockMessage: inCurrentWindow
            ? `Ventana de edición abierta hasta ${windowEnd.toLocaleDateString('es-ES')}`
            : 'Objetivos editables',
        shouldStartNewWindow: !inCurrentWindow,
        nextUnlockDate
    };
}

export function formatNumberForExport(value) {
    const safeValue = Number.isFinite(value) ? value : 0;
    return safeValue.toLocaleString('es-ES', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6
    });
}

export function parseEuroValue(value) {
    if (!value) return 0;
    return parseFloat(value.replace('€', '').replace('.', '').replace(',', '.').trim()) || 0;
}

export function parseNumber(value) {
    if (!value) return 0;
    return parseFloat(value.replace('.', '').replace(',', '.').trim()) || 0;
}

export function parseData(rawData) {
    const lines = rawData.trim().split('\n').filter(line => line.trim());
    const assets = [];

    for (const line of lines) {
        const parts = line.includes('\t') ? line.split('\t') : line.split(';');
        if (parts.length < 8) continue;

        const asset = [];
        asset[AssetIndex.NAME] = parts[0].trim();
        asset[AssetIndex.TERM] = parts[1].trim();
        asset[AssetIndex.CATEGORY] = parts[2].trim();
        asset[AssetIndex.PURCHASE_PRICE] = parseEuroValue(parts[3]);
        asset[AssetIndex.QUANTITY] = parseNumber(parts[4]);
        asset[AssetIndex.CURRENT_PRICE] = parseEuroValue(parts[5]);
        asset[AssetIndex.PURCHASE_VALUE] = parseEuroValue(parts[6]);
        asset[AssetIndex.CURRENT_VALUE] = parseEuroValue(parts[7]);

        assets.push(asset);
    }

    return assets;
}

export function calculateVolatility(returns) {
    if (!returns || returns.length < 2) return null;
    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance = returns.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / returns.length;
    return Math.sqrt(variance) * Math.sqrt(12) * 100;
}

export function calculateMaxDrawdown(values) {
    if (!values || values.length < 2) return null;
    let peak = values[0];
    let maxDrawdown = 0;

    values.forEach(value => {
        if (value > peak) peak = value;
        if (peak > 0) {
            const drawdown = (value - peak) / peak;
            if (drawdown < maxDrawdown) maxDrawdown = drawdown;
        }
    });

    return maxDrawdown * 100;
}

export function totalMonthlyAllocationForTarget(target, sumTargets, budget) {
    if (!budget || !sumTargets) return 0;
    const ratio = Math.max(target, 0) / sumTargets;
    return ratio * budget;
}

export function calculateAnnualizedRoi(value, invested, startDate, currentDate) {
    if (invested <= 0) return 0;
    const ratio = value / invested;
    if (ratio <= 0) return 0;
    const years = (currentDate - startDate) / (365.25 * 24 * 60 * 60 * 1000);
    if (years <= 0) return 0;
    return (Math.pow(ratio, 1 / years) - 1) * 100;
}

export function getMonthlySnapshots(snapshots) {
    const map = new Map();
    snapshots.forEach(snapshot => {
        const date = new Date(snapshot.date);
        const key = `${date.getFullYear()}-${date.getMonth()}`;
        map.set(key, snapshot);
    });

    return Array.from(map.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
}

export function getSnapshotsForRange(snapshots, currentRange) {
    if (snapshots.length === 0) return [];
    if (currentRange === 'all') return snapshots;

    const latestSnapshot = snapshots.at(-1);
    const endDate = new Date(latestSnapshot.date);
    const startDate = new Date(endDate);

    if (currentRange === '6m') startDate.setMonth(startDate.getMonth() - 6);
    if (currentRange === '1y') startDate.setMonth(startDate.getMonth() - 12);
    if (currentRange === '3y') startDate.setMonth(startDate.getMonth() - 36);

    startDate.setHours(0, 0, 0, 0);

    return snapshots.filter(snapshot => new Date(snapshot.date) >= startDate);
}

export function getMonthlySnapshotsForRange(snapshots, currentRange) {
    const rangeSnapshots = getSnapshotsForRange(snapshots, currentRange);
    return getMonthlySnapshots(rangeSnapshots);
}

export function shouldAggregateRangeByMonth(currentRange) {
    return currentRange === '1y' || currentRange === '3y' || currentRange === 'all';
}

export function getSnapshotsForChartRange(snapshots, currentRange) {
    if (shouldAggregateRangeByMonth(currentRange)) {
        return getMonthlySnapshotsForRange(snapshots, currentRange);
    }
    return getSnapshotsForRange(snapshots, currentRange);
}

export function getPreviousMonthSnapshot(snapshots, currentSnapshot) {
    if (!currentSnapshot) return null;

    const currentDate = new Date(currentSnapshot.date);
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    for (let i = snapshots.length - 2; i >= 0; i--) {
        const snapshot = snapshots[i];
        const snapshotDate = new Date(snapshot.date);

        if (
            snapshotDate.getFullYear() < currentYear
            || (snapshotDate.getFullYear() === currentYear && snapshotDate.getMonth() < currentMonth)
        ) {
            return snapshot;
        }
    }

    return null;
}

export function getSnapshotMonthsAgo(snapshots, currentSnapshot, monthsBack) {
    if (!currentSnapshot) return null;

    const currentDate = new Date(currentSnapshot.date);
    const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - monthsBack + 1, 0);
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth();

    for (let i = snapshots.length - 2; i >= 0; i--) {
        const snapshot = snapshots[i];
        const snapshotDate = new Date(snapshot.date);

        if (
            snapshotDate.getFullYear() < targetYear
            || (snapshotDate.getFullYear() === targetYear && snapshotDate.getMonth() <= targetMonth)
        ) {
            return snapshot;
        }
    }

    return null;
}

export function getYearStartSnapshot(snapshots, currentSnapshot) {
    if (!currentSnapshot) return null;

    const currentDate = new Date(currentSnapshot.date);
    const startDate = new Date(currentDate.getFullYear(), 0, 1);

    for (let i = 0; i < snapshots.length; i++) {
        const snapshot = snapshots[i];
        const snapshotDate = new Date(snapshot.date);
        if (snapshotDate >= startDate) {
            return snapshot;
        }
    }

    return null;
}
