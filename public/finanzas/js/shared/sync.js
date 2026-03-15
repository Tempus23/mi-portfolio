// Cloud sync module for Patrimony
// Uses Cloudflare KV via /api/finanzas/sync endpoint
// Security handled by Cloudflare Access (no PIN needed)

const SYNC_API = new URL('/api/finanzas/sync', globalThis.location.origin).toString();
const SYNC_KEYS = {
    SNAPSHOTS: 'portfolio_snapshots',
    TARGETS: 'portfolio_targets',
    TARGETS_META: 'portfolio_targets_meta'
};
const SYNC_META_KEY = 'portfolio_sync_meta';

const EMPTY_SYNC_META = {
    dirty: false,
    lastLocalWriteAt: null,
    lastCloudSyncAt: null
};

let _onSyncComplete = null;
let _syncQueue = Promise.resolve();

export function setSyncCallback(callback) {
    _onSyncComplete = callback;
}

function getSyncMeta() {
    const raw = localStorage.getItem(SYNC_META_KEY);
    if (!raw) return { ...EMPTY_SYNC_META };

    try {
        const parsed = JSON.parse(raw);
        return {
            dirty: parsed?.dirty === true,
            lastLocalWriteAt: typeof parsed?.lastLocalWriteAt === 'string' ? parsed.lastLocalWriteAt : null,
            lastCloudSyncAt: typeof parsed?.lastCloudSyncAt === 'string' ? parsed.lastCloudSyncAt : null
        };
    } catch {
        return { ...EMPTY_SYNC_META };
    }
}

function saveSyncMeta(meta) {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
}

function markLocalClean(lastCloudSyncAt = null) {
    const meta = getSyncMeta();
    saveSyncMeta({
        ...meta,
        dirty: false,
        lastCloudSyncAt: lastCloudSyncAt || new Date().toISOString()
    });
}

function toTimestamp(isoString) {
    if (!isoString) return null;
    const value = Date.parse(isoString);
    return Number.isFinite(value) ? value : null;
}

async function getSyncErrorMessage(res, fallbackMessage) {
    const text = await res.text();
    let msg = fallbackMessage;
    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
        try {
            msg = JSON.parse(text).error || msg;
        } catch {
            // Keep fallback
        }
    } else if (res.status === 401 || res.status === 403) {
        msg = 'Acceso denegado (Cloudflare Access)';
    } else if (res.status === 404) {
        msg = 'API no encontrada';
    } else if (res.status >= 500) {
        msg = 'Error del servidor';
    }

    console.error('[Sync] HTTP Error:', res.status, text.substring(0, 200));
    return `${msg} (HTTP ${res.status})`;
}

function shouldSkipRemoteApply(data) {
    const meta = getSyncMeta();
    if (!meta.dirty) return false;

    const remoteTs = toTimestamp(data?.lastModified || null);
    const localTs = toTimestamp(meta.lastLocalWriteAt);
    return localTs === null || remoteTs === null || localTs >= remoteTs;
}

function applyRemoteData(data) {
    if (data.snapshots !== null && data.snapshots !== undefined) {
        localStorage.setItem(SYNC_KEYS.SNAPSHOTS, JSON.stringify(data.snapshots));
    }
    if (data.targets !== null && data.targets !== undefined) {
        localStorage.setItem(SYNC_KEYS.TARGETS, JSON.stringify(data.targets));
    }
    if (data.targetsMeta !== null && data.targetsMeta !== undefined) {
        localStorage.setItem(SYNC_KEYS.TARGETS_META, JSON.stringify(data.targetsMeta));
    }
}

function runInSyncQueue(task) {
    const run = _syncQueue.then(() => task());
    _syncQueue = run.catch(() => { });
    return run;
}

export function markLocalDirty() {
    const meta = getSyncMeta();
    saveSyncMeta({
        ...meta,
        dirty: true,
        lastLocalWriteAt: new Date().toISOString()
    });
}

// Download data from cloud → localStorage
async function pullFromCloud() {
    console.info('[Sync Pull] GET', SYNC_API);
    const res = await fetch(SYNC_API, {
        credentials: 'include',
        cache: 'no-store'
    });

    if (!res.ok) {
        throw new Error(await getSyncErrorMessage(res, 'Error al descargar'));
    }

    const data = await res.json();
    console.log('[Sync Pull] OK:', data);

    if (shouldSkipRemoteApply(data)) {
        console.warn('[Sync Pull] Skipped applying remote data: pending local changes are newer or unresolved.');
        return { ...data, skipped: true };
    }

    applyRemoteData(data);

    markLocalClean(data?.lastModified || null);

    return { ...data, skipped: false };
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
        body: JSON.stringify(body),
        credentials: 'include',
        cache: 'no-store'
    });

    if (!res.ok) {
        throw new Error(await getSyncErrorMessage(res, 'Error al subir'));
    }

    const data = await res.json();
    console.log('[Sync Push] OK:', data);
    return data;
}

// High-level: pull and reload UI
export async function syncPull(showToast) {
    return runInSyncQueue(async () => {
        try {
            const meta = getSyncMeta();
            if (meta.dirty) {
                if (showToast) showToast('Subiendo cambios locales antes de descargar...', 'success');
                const pushData = await pushToCloud();
                markLocalClean(pushData?.lastModified || null);
            }

            if (showToast) showToast('Descargando de la nube...', 'success');
            const pullResult = await pullFromCloud();

            if (pullResult?.skipped) {
                if (showToast) showToast('Sync parcial: cambios locales pendientes, no se sobrescribieron datos.', 'error');
                return false;
            }

            if (showToast) showToast('Datos descargados de la nube ☁️↓', 'success');
            if (_onSyncComplete) _onSyncComplete();
            return true;
        } catch (e) {
            console.error('[Sync Pull] Failed:', e);
            if (showToast) showToast('Error sync: ' + e.message, 'error');
            return false;
        }
    });
}

// High-level: push to cloud
export async function syncPush(showToast) {
    return runInSyncQueue(async () => {
        try {
            const data = await pushToCloud();
            markLocalClean(data?.lastModified || null);
            if (showToast) showToast('Datos guardados en la nube ☁️↑', 'success');
            return true;
        } catch (e) {
            console.error('[Sync Push] Failed:', e);
            if (showToast) showToast('Error sync: ' + e.message, 'error');
            return false;
        }
    });
}
