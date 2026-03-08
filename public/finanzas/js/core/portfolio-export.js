import { showToast } from '../shared/toast.js';
import { AssetIndex } from '../shared/constants.js';
import { formatNumberForExport } from '../shared/portfolio-utils.js';

export function exportToJson(snapshots) {
    if (!snapshots || snapshots.length === 0) {
        showToast('No hay datos para exportar', 'error');
        return;
    }
    const dataToExport = snapshots.map(s => ({
        id: s.id,
        date: s.date,
        assets: s.assets,
        tag: s.tag || '',
        note: s.note || ''
    }));

    const dataStr = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `portfolio_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Archivo exportado correctamente', 'success');
}

export function exportLatestSnapshotToClipboard(snapshots) {
    if (!snapshots || snapshots.length === 0) {
        showToast('No hay snapshots para exportar', 'error');
        return;
    }
    exportSnapshotToClipboard(snapshots[snapshots.length - 1]);
}

export function exportSnapshotToClipboard(snapshot) {
    if (!snapshot) {
        showToast('Snapshot no encontrado', 'error');
        return;
    }

    const lines = snapshot.assets.map(asset => {
        return [
            asset[AssetIndex.NAME],
            asset[AssetIndex.TERM],
            asset[AssetIndex.CATEGORY],
            formatNumberForExport(asset[AssetIndex.PURCHASE_PRICE]),
            formatNumberForExport(asset[AssetIndex.QUANTITY]),
            formatNumberForExport(asset[AssetIndex.CURRENT_PRICE])
        ].join('\t');
    });

    const tsv = lines.join('\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(tsv)
            .then(() => showToast('Snapshot copiado al portapapeles', 'success'))
            .catch(() => fallbackCopyText(tsv));
    } else {
        fallbackCopyText(tsv);
    }
}

function fallbackCopyText(text) {
    const temp = document.createElement('textarea');
    temp.value = text;
    temp.setAttribute('readonly', '');
    temp.style.position = 'absolute';
    temp.style.left = '-9999px';
    document.body.appendChild(temp);
    temp.select();
    const success = document.execCommand('copy');
    document.body.removeChild(temp);
    showToast(success ? 'Snapshot copiado al portapapeles' : 'No se pudo copiar el snapshot', success ? 'success' : 'error');
}

export async function processImportedJson(rawText, normalizeSnapshot, calculateSnapshotMetrics) {
    try {
        const imported = JSON.parse(rawText);
        if (!Array.isArray(imported)) {
            throw new TypeError('Formato inválido');
        }

        const optimized = imported
            .map(normalizeSnapshot)
            .map(calculateSnapshotMetrics)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        showToast('Datos importados y optimizados', 'success');
        return optimized;
    } catch (error) {
        console.error('[Import] Error importando JSON:', error);
        showToast('Error al importar el archivo JSON', 'error');
        return null;
    }
}
