// core/data-store.js — Centralized data store with pub/sub events
// Maintains full backward compatibility with existing localStorage keys and data formats

import { STORAGE_KEYS, AssetIndex } from '../shared/constants.js';
import { calculateSnapshotMetrics, migrateToArrays } from '../shared/portfolio-utils.js';
import { markLocalDirty, syncPush, setSyncCallback, syncPull } from '../shared/sync.js';
import { showToast } from '../shared/toast.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

export function toSafeNumber(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    // Handle European format: "1.234,56" -> "1234.56"
    const cleaned = String(value)
        .replace(/\./g, '')       // Remove thousands separator
        .replace(',', '.');       // Replace decimal comma with dot
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeAsset(asset) {
    if (Array.isArray(asset)) {
        return [
            String(asset[AssetIndex.NAME] || '').trim(),
            String(asset[AssetIndex.TERM] || '').trim(),
            String(asset[AssetIndex.CATEGORY] || '').trim(),
            toSafeNumber(asset[AssetIndex.PURCHASE_PRICE]),
            toSafeNumber(asset[AssetIndex.QUANTITY]),
            toSafeNumber(asset[AssetIndex.CURRENT_PRICE]),
            toSafeNumber(asset[AssetIndex.PURCHASE_VALUE]),
            toSafeNumber(asset[AssetIndex.CURRENT_VALUE])
        ];
    }
    return [
        String(asset?.name || '').trim(),
        String(asset?.term || '').trim(),
        String(asset?.category || '').trim(),
        toSafeNumber(asset?.purchasePrice),
        toSafeNumber(asset?.quantity),
        toSafeNumber(asset?.currentPrice),
        toSafeNumber(asset?.purchaseValue),
        toSafeNumber(asset?.currentValue)
    ];
}

export function normalizeSnapshot(snapshot) {
    const parsedDate = snapshot?.date ? new Date(snapshot.date) : null;
    const isDateValid = parsedDate && Number.isFinite(parsedDate.getTime());
    return {
        id: Number.isFinite(snapshot?.id) ? snapshot.id : Date.now(),
        date: isDateValid ? parsedDate.toISOString() : new Date().toISOString(),
        assets: (snapshot?.assets || []).map(normalizeAsset),
        tag: typeof snapshot?.tag === 'string' ? snapshot.tag.trim() : '',
        note: typeof snapshot?.note === 'string' ? snapshot.note.trim() : ''
    };
}

export function clampAdjustmentHardness(value) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return 0.5;
    return Math.max(0, Math.min(1, parsed));
}

export function normalizeTargetsMeta(meta) {
    return {
        monthlyBudget: Math.max(0, Number.parseFloat(meta?.monthlyBudget) || 0),
        adjustmentHardness: clampAdjustmentHardness(meta?.adjustmentHardness),
        ...(meta?.lastObjectiveUpdateAt ? { lastObjectiveUpdateAt: meta.lastObjectiveUpdateAt } : {})
    };
}

// ─── DataStore Class ────────────────────────────────────────────────────────

class DataStore {
    constructor() {
        this._listeners = new Map();
        this._snapshots = [];
        this._targets = {};
        this._targetsMeta = normalizeTargetsMeta({});
        this._selectedCategory = null;
    }

    // ── Event system ──

    on(event, fn) {
        if (!this._listeners.has(event)) this._listeners.set(event, new Set());
        this._listeners.get(event).add(fn);
        return () => this.off(event, fn);
    }

    off(event, fn) {
        this._listeners.get(event)?.delete(fn);
    }

    emit(event, data) {
        this._listeners.get(event)?.forEach(fn => {
            try { fn(data); } catch (e) { console.error(`[DataStore] Error in ${event} handler:`, e); }
        });
    }

    // ── Getters ──

    get snapshots() { return this._snapshots; }
    get targets() { return this._targets; }
    get targetsMeta() { return this._targetsMeta; }
    get selectedCategory() { return this._selectedCategory; }

    get latestSnapshot() {
        return this._snapshots.length > 0 ? this._snapshots[this._snapshots.length - 1] : null;
    }

    async refreshPrices() {
        const latest = this.latestSnapshot;
        if (!latest) return { success: false, message: 'No hay snapshots para actualizar' };

        try {
            const response = await fetch('/api/finanzas/prices?refresh=true');
            if (!response.ok) throw new Error('Error al obtener precios de la API');
            
            const prices = await response.json();
            
            // Create a lowercase map for case-insensitive lookup
            const pricesLower = Object.keys(prices).reduce((acc, key) => {
                acc[key.toLowerCase()] = prices[key];
                return acc;
            }, {});
            
            let updatedCount = 0;

            const updatedAssets = latest.assets.map(asset => {
                const name = asset[AssetIndex.NAME];
                const nameLower = name.toLowerCase();

                // Use high precision for calculations
                const quantity = toSafeNumber(asset[AssetIndex.QUANTITY]);
                const oldPrice = toSafeNumber(asset[AssetIndex.CURRENT_PRICE]);
                const oldValue = toSafeNumber(asset[AssetIndex.CURRENT_VALUE]);

                // Calculate what the value SHOULD be based on quantity and old price
                const theoreticalOldValue = quantity * oldPrice;
                const desync = Math.abs(oldValue - theoreticalOldValue) > 0.01;

                if (pricesLower[nameLower]) {
                    const newPrice = pricesLower[nameLower];
                    const newValue = newPrice * quantity;

                    if (desync) {
                        console.warn(`[DataStore] ${name} value was desynced! Was ${oldValue.toFixed(2)}, set to ${newValue.toFixed(2)}`);
                    }

                    const newAsset = [...asset];
                    newAsset[AssetIndex.CURRENT_PRICE] = newPrice;
                    newAsset[AssetIndex.CURRENT_VALUE] = newValue;

                    updatedCount++;
                    return newAsset;
                }
                return asset;
            });

            if (updatedCount === 0) {
                return { success: false, message: 'No se encontraron precios para actualizar' };
            }

            // Create a NEW snapshot
            const newSnapshot = {
                id: Date.now(),
                date: new Date().toISOString(),
                assets: updatedAssets.map(a => normalizeAsset(a)),
                tag: 'Actualización automática',
                note: `Precios actualizados automáticamente basándose en el snapshot previo.`
            };

            const finalSnapshot = calculateSnapshotMetrics(newSnapshot);
            this.addSnapshot(finalSnapshot);

            return { success: true, message: `Nuevo snapshot creado con ${updatedCount} activos actualizados` };

            return { success: true, message: `Nuevo snapshot creado con ${updatedCount} activos actualizados` };
        } catch (error) {
            console.error('[DataStore] Error refreshing prices:', error);
            return { success: false, message: 'Error en la conexión con la API' };
        }
    }

    get categories() {
        const latest = this.latestSnapshot;
        return latest ? Object.keys(latest.categoryTotals || {}).sort((a, b) => a.localeCompare(b, 'es')) : [];
    }

    // ── Load all data from localStorage ──

    loadAll() {
        this._loadSnapshots();
        this._loadTargets();
        this._loadTargetsMeta();
        this._loadSelectedCategory();
        this.emit('loaded');
    }

    _loadSnapshots() {
        const stored = localStorage.getItem(STORAGE_KEYS.SNAPSHOTS);
        if (!stored) { this._snapshots = []; return; }

        let loadedData;
        try {
            loadedData = JSON.parse(stored);
        } catch (error) {
            console.error('[DataStore] Error parsing snapshots:', error);
            localStorage.removeItem(STORAGE_KEYS.SNAPSHOTS);
            this._snapshots = [];
            showToast('Datos corruptos en almacenamiento local. Se reinició el historial.', 'error');
            return;
        }

        if (!Array.isArray(loadedData)) {
            localStorage.removeItem(STORAGE_KEYS.SNAPSHOTS);
            this._snapshots = [];
            showToast('Formato de historial inválido. Se reinició el historial.', 'error');
            return;
        }

        // Migrate from old object format if needed
        if (loadedData.length > 0 && Array.isArray(loadedData[0]?.assets) && loadedData[0].assets.length > 0 && !Array.isArray(loadedData[0].assets[0])) {
            loadedData = migrateToArrays(loadedData);
        }

        this._snapshots = loadedData
            .map(normalizeSnapshot)
            .map(calculateSnapshotMetrics);

        // Save cleaned version
        this._persistSnapshots();
    }

    _loadTargets() {
        const stored = localStorage.getItem(STORAGE_KEYS.TARGETS);
        if (!stored) { this._targets = {}; return; }
        try {
            const parsed = JSON.parse(stored);
            this._targets = parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            console.error('[DataStore] Error parsing targets:', error);
            localStorage.removeItem(STORAGE_KEYS.TARGETS);
            this._targets = {};
        }
    }

    _loadTargetsMeta() {
        const stored = localStorage.getItem(STORAGE_KEYS.TARGETS_META);
        if (!stored) { this._targetsMeta = normalizeTargetsMeta({}); return; }
        try {
            this._targetsMeta = normalizeTargetsMeta(JSON.parse(stored));
        } catch (error) {
            console.error('[DataStore] Error parsing targets meta:', error);
            localStorage.removeItem(STORAGE_KEYS.TARGETS_META);
            this._targetsMeta = normalizeTargetsMeta({});
        }
    }

    _loadSelectedCategory() {
        const stored = localStorage.getItem(STORAGE_KEYS.SELECTED_CATEGORY);
        if (!stored) { this._selectedCategory = null; return; }
        if (this._snapshots.length === 0) { this._selectedCategory = null; return; }
        const latest = this.latestSnapshot;
        const categories = Object.keys(latest?.categoryTotals || {});
        this._selectedCategory = categories.includes(stored) ? stored : null;
    }

    // ── Persistence (writes to localStorage + cloud sync) ──

    _persistSnapshots() {
        const dataToSave = this._snapshots.map(s => ({
            id: s.id, date: s.date, assets: s.assets, tag: s.tag || '', note: s.note || ''
        }));
        localStorage.setItem(STORAGE_KEYS.SNAPSHOTS, JSON.stringify(dataToSave));
    }

    _saveSnapshotsAndSync() {
        this._persistSnapshots();
        markLocalDirty();
        syncPush(null);
        this.emit('snapshots-changed', this._snapshots);
    }

    saveTargets(newTargets) {
        if (newTargets !== undefined) this._targets = newTargets;
        try {
            localStorage.setItem(STORAGE_KEYS.TARGETS, JSON.stringify(this._targets));
        } catch (error) {
            console.error('[DataStore] Error saving targets:', error);
            showToast('No se pudieron guardar los objetivos.', 'error');
            return;
        }
        markLocalDirty();
        syncPush(null);
        this.emit('targets-changed', this._targets);
    }

    saveTargetsMeta(newMeta) {
        if (newMeta !== undefined) this._targetsMeta = newMeta;
        try {
            localStorage.setItem(STORAGE_KEYS.TARGETS_META, JSON.stringify(this._targetsMeta));
        } catch (error) {
            console.error('[DataStore] Error saving targets meta:', error);
            showToast('No se pudieron guardar los metadatos.', 'error');
            return;
        }
        markLocalDirty();
        syncPush(null);
        this.emit('targets-meta-changed', this._targetsMeta);
    }

    // ── Snapshot operations ──

    addSnapshot(snapshotRaw) {
        const snapshot = calculateSnapshotMetrics(snapshotRaw);
        this._snapshots.push(snapshot);
        this._snapshots.sort((a, b) => new Date(a.date) - new Date(b.date));
        this._saveSnapshotsAndSync();
        return snapshot;
    }

    updateSnapshot(id, data) {
        const index = this._snapshots.findIndex(s => s.id === id);
        if (index === -1) return null;
        const updated = calculateSnapshotMetrics({ ...data, id });
        this._snapshots[index] = updated;
        this._snapshots.sort((a, b) => new Date(a.date) - new Date(b.date));
        this._saveSnapshotsAndSync();
        return updated;
    }

    deleteSnapshot(id) {
        this._snapshots = this._snapshots.filter(s => s.id !== id);
        this._saveSnapshotsAndSync();
    }

    replaceAllSnapshots(newSnapshots) {
        this._snapshots = newSnapshots
            .map(normalizeSnapshot)
            .map(calculateSnapshotMetrics)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        this._saveSnapshotsAndSync();
    }

    // ── Category selection ──

    setSelectedCategory(category) {
        this._selectedCategory = category || null;
        if (this._selectedCategory) {
            localStorage.setItem(STORAGE_KEYS.SELECTED_CATEGORY, this._selectedCategory);
        } else {
            localStorage.removeItem(STORAGE_KEYS.SELECTED_CATEGORY);
        }
        this.emit('category-changed', this._selectedCategory);
    }

    // ── Cloud sync setup ──

    setupSync() {
        setSyncCallback(() => {
            this.loadAll();
            this.emit('ui-refresh');
        });
        syncPull(showToast);
    }

    // ── Portfolio summary for AI ──

    getPortfolioSummary() {
        const latest = this.latestSnapshot;
        if (!latest) return null;

        const categories = Object.keys(latest.categoryTotals || {});
        const totalValue = latest.totalCurrentValue;
        const totalInvested = latest.totalPurchaseValue;
        const roi = totalInvested > 0 ? ((totalValue - totalInvested) / totalInvested * 100) : 0;

        const categoryBreakdown = categories.map(cat => {
            const catAssets = latest.assets.filter(a => a[AssetIndex.CATEGORY] === cat);
            const value = catAssets.reduce((s, a) => s + a[AssetIndex.CURRENT_VALUE], 0);
            const invested = catAssets.reduce((s, a) => s + a[AssetIndex.PURCHASE_VALUE], 0);
            const catRoi = invested > 0 ? ((value - invested) / invested * 100) : 0;
            const weight = totalValue > 0 ? (value / totalValue * 100) : 0;
            const target = this._targets[cat]?.target ?? null;

            return {
                category: cat,
                value: Math.round(value * 100) / 100,
                invested: Math.round(invested * 100) / 100,
                roi: Math.round(catRoi * 100) / 100,
                weight: Math.round(weight * 100) / 100,
                target,
                assets: catAssets.map(a => ({
                    name: a[AssetIndex.NAME],
                    term: a[AssetIndex.TERM],
                    value: Math.round(a[AssetIndex.CURRENT_VALUE] * 100) / 100,
                    invested: Math.round(a[AssetIndex.PURCHASE_VALUE] * 100) / 100,
                    roi: a[AssetIndex.PURCHASE_VALUE] > 0
                        ? Math.round(((a[AssetIndex.CURRENT_VALUE] - a[AssetIndex.PURCHASE_VALUE]) / a[AssetIndex.PURCHASE_VALUE] * 100) * 100) / 100
                        : 0,
                    weight: totalValue > 0 ? Math.round((a[AssetIndex.CURRENT_VALUE] / totalValue * 100) * 100) / 100 : 0
                }))
            };
        });

        // Historical performance (last 12 monthly snapshots)
        const monthly = this._getMonthlySnapshots().slice(-12);
        const history = monthly.map(s => ({
            date: s.date.split('T')[0],
            value: Math.round(s.totalCurrentValue * 100) / 100,
            invested: Math.round(s.totalPurchaseValue * 100) / 100
        }));

        return {
            date: latest.date.split('T')[0],
            totalValue: Math.round(totalValue * 100) / 100,
            totalInvested: Math.round(totalInvested * 100) / 100,
            totalRoi: Math.round(roi * 100) / 100,
            assetCount: latest.assets.length,
            categoryCount: categories.length,
            categories: categoryBreakdown,
            monthlyBudget: this._targetsMeta.monthlyBudget || 0,
            history,
            snapshotCount: this._snapshots.length
        };
    }

    _getMonthlySnapshots() {
        const map = new Map();
        this._snapshots.forEach(snapshot => {
            const date = new Date(snapshot.date);
            const key = `${date.getFullYear()}-${date.getMonth()}`;
            map.set(key, snapshot);
        });
        return Array.from(map.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
    }
}

// ── Singleton export ──
export const store = new DataStore();
