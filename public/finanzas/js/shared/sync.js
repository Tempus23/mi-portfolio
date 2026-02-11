// Cloud sync module for Patrimony
// Uses Cloudflare KV via /api/finanzas/sync endpoint
// Security handled by Cloudflare Access (no PIN needed)

const SYNC_API = '/api/finanzas/sync';
const SYNC_KEYS = {
    SNAPSHOTS: 'portfolio_snapshots',
    TARGETS: 'portfolio_targets',
    TARGETS_META: 'portfolio_targets_meta'
};

let _onSyncComplete = null;

export function setSyncCallback(callback) {
    _onSyncComplete = callback;
}

// Download data from cloud → localStorage
async function pullFromCloud() {
    const res = await fetch(SYNC_API);

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al descargar');
    }

    const data = await res.json();

    if (data.snapshots !== null && data.snapshots !== undefined) {
        localStorage.setItem(SYNC_KEYS.SNAPSHOTS, JSON.stringify(data.snapshots));
    }
    if (data.targets !== null && data.targets !== undefined) {
        localStorage.setItem(SYNC_KEYS.TARGETS, JSON.stringify(data.targets));
    }
    if (data.targetsMeta !== null && data.targetsMeta !== undefined) {
        localStorage.setItem(SYNC_KEYS.TARGETS_META, JSON.stringify(data.targetsMeta));
    }

    return data;
}

// Upload localStorage data → cloud
async function pushToCloud() {
    const snapshots = localStorage.getItem(SYNC_KEYS.SNAPSHOTS);
    const targets = localStorage.getItem(SYNC_KEYS.TARGETS);
    const targetsMeta = localStorage.getItem(SYNC_KEYS.TARGETS_META);

    const body = {};
    if (snapshots) body.snapshots = JSON.parse(snapshots);
    if (targets) body.targets = JSON.parse(targets);
    if (targetsMeta) body.targetsMeta = JSON.parse(targetsMeta);

    const res = await fetch(SYNC_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al subir');
    }

    return await res.json();
}

// High-level: pull and reload UI
export async function syncPull(showToast) {
    try {
        await pullFromCloud();
        if (showToast) showToast('Datos descargados de la nube ☁️↓', 'success');
        if (_onSyncComplete) _onSyncComplete();
    } catch (e) {
        if (showToast) showToast(e.message, 'error');
    }
}

// High-level: push to cloud
export async function syncPush(showToast) {
    try {
        await pushToCloud();
        if (showToast) showToast('Datos guardados en la nube ☁️↑', 'success');
    } catch (e) {
        if (showToast) showToast(e.message, 'error');
    }
}
