import { STORAGE_KEYS, AssetIndex, CATEGORY_COLORS, TERM_COLORS } from './js/shared/constants.js';
import { formatCurrency } from './js/shared/format.js';
import { showToast } from './js/shared/toast.js';
import { syncPull, syncPush, setSyncCallback } from './js/shared/sync.js';

const {
    SNAPSHOTS: STORAGE_KEY,
    TARGETS: TARGETS_KEY,
    TARGETS_META: TARGETS_META_KEY,
    HOLDINGS_CHANGES: HOLDINGS_CHANGES_KEY,
    SELECTED_CATEGORY: SELECTED_CATEGORY_KEY
} = STORAGE_KEYS;

let snapshots = [];
let evolutionChart = null;
let roiEvolutionChart = null;
let categoryChart = null;
let termChart = null;
let targetsChart = null;
let currentChartMode = 'total';
let currentRoiMode = 'cumulative';
let selectedCategory = null;
let evolutionScaleMode = 'linear';
let evolutionMinMode = 'zero';
let currentRange = 'all';
let categoryTargets = {};
let targetsMeta = { monthlyBudget: 0 };
let compositionCompareMonths = 1;
let opportunityRangeMonths = 1;

const categoryColors = CATEGORY_COLORS;
const termColors = TERM_COLORS;

if (typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
} else {
    console.warn('[Charts] Chart.js or ChartDataLabels not available. Charts may not render.');
}

function init() {
    loadSnapshots();
    loadTargets();
    loadTargetsMeta();
    loadSelectedCategory();
    updateCurrentDate();
    setupEventListeners();
    initCharts();
    updateUI();
    showHoldingsChangesIfAny();

    // Cloud sync: set reload callback
    setSyncCallback(() => {
        loadSnapshots();
        loadTargets();
        loadTargetsMeta();
        updateUI();
    });

    // Auto-pull from cloud on load (Cloudflare Access handles auth)
    syncPull(showToast);
}

function loadSnapshots() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        let loadedData;
        try {
            loadedData = JSON.parse(stored);
        } catch (error) {
            localStorage.removeItem(STORAGE_KEY);
            snapshots = [];
            showToast('Datos corruptos en almacenamiento local. Se reinició el historial.', 'error');
            return;
        }

        // 1. Array Migration (if older version)
        if (loadedData.length > 0 && loadedData[0].assets.length > 0 && !Array.isArray(loadedData[0].assets[0])) {
            console.log("Migrating data to compact format...");
            loadedData = migrateToArrays(loadedData);
        }

        // 2. Data Compression (Runtime Calculation)
        // Ensure we strip old aggregated data if present to save space on next save
        snapshots = loadedData.map(s => {
            // Delete old aggregated keys if they exist
            // (We don't delete them from the object reference here to avoid side effects during map, 
            // but we will recalculate everything freshly)
            const cleanSnapshot = {
                id: s.id,
                date: s.date,
                assets: s.assets,
                tag: s.tag || '',
                note: s.note || ''
            };
            return calculateSnapshotMetrics(cleanSnapshot);
        });

        // Save cleaned version immediately to compress storage
        saveSnapshots();
    } else {
        snapshots = [];
    }
}

function calculateSnapshotMetrics(snapshot) {
    const assets = snapshot.assets;

    const totalCurrentValue = assets.reduce((sum, a) => sum + a[AssetIndex.CURRENT_VALUE], 0);
    const totalPurchaseValue = assets.reduce((sum, a) => sum + a[AssetIndex.PURCHASE_VALUE], 0);
    const variation = totalCurrentValue - totalPurchaseValue;

    const categoryTotals = {};
    const categoryInvested = {};
    const termTotals = {};

    assets.forEach(asset => {
        const cat = asset[AssetIndex.CATEGORY];
        const term = asset[AssetIndex.TERM];
        const currentVal = asset[AssetIndex.CURRENT_VALUE];
        const purchaseVal = asset[AssetIndex.PURCHASE_VALUE];

        categoryTotals[cat] = (categoryTotals[cat] || 0) + currentVal;
        categoryInvested[cat] = (categoryInvested[cat] || 0) + purchaseVal;
        termTotals[term] = (termTotals[term] || 0) + currentVal;
    });

    // Return extended object with computed metrics (metrics are NOT saved to localStorage, only computed on load)
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

function migrateToArrays(oldSnapshots) {
    return oldSnapshots.map(snapshot => {
        const newAssets = snapshot.assets.map(asset => {
            return [
                asset.name,
                asset.term,
                asset.category,
                asset.purchasePrice,
                asset.quantity,
                asset.currentPrice,
                asset.purchaseValue,
                asset.currentValue
            ];
        });
        return { ...snapshot, assets: newAssets };
    });
}

function saveSnapshots() {
    // Only save essential data (id, date, assets)
    const dataToSave = snapshots.map(s => ({
        id: s.id,
        date: s.date,
        assets: s.assets,
        tag: s.tag || '',
        note: s.note || ''
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    // Auto-push to cloud
    syncPush(null);
}

function updateCurrentDate() {
    const now = new Date();
    const dateInput = document.getElementById('snapshotDate');
    if (dateInput) {
        dateInput.value = now.toISOString().split('T')[0];
    }
}

function toggleCaptureModal(show) {
    const modal = document.getElementById('captureModal');
    if (show) {
        modal.classList.add('show');
        updateCurrentDate();
    } else {
        modal.classList.remove('show');
    }
}

function setupEventListeners() {
    const openHoldingsBtn = document.getElementById('openHoldingsBtn');
    if (openHoldingsBtn) {
        openHoldingsBtn.addEventListener('click', () => {
            window.location.href = '/finanzas/investments.html';
        });
    }

    document.getElementById('captureBtn').addEventListener('click', () => toggleCaptureModal(true));
    document.getElementById('closeCaptureModal').addEventListener('click', () => toggleCaptureModal(false));
    document.getElementById('cancelCapture').addEventListener('click', () => toggleCaptureModal(false));
    document.getElementById('saveCapture').addEventListener('click', captureSnapshot);

    document.querySelectorAll('.segment').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.segment').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentChartMode = e.target.dataset.filter;
            updateEvolutionChart();
        });
    });

    document.querySelectorAll('.segment-roi').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.segment-roi').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentRoiMode = e.target.dataset.roi;
            updateRoiEvolutionChart();
        });
    });

    document.querySelectorAll('.range-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentRange = e.target.dataset.range;
            updateEvolutionChart();
            updateAnalytics();
        });
    });

    const evolutionLogScale = document.getElementById('evolutionLogScale');
    if (evolutionLogScale) {
        evolutionLogScale.addEventListener('change', (e) => {
            evolutionScaleMode = e.target.checked ? 'logarithmic' : 'linear';
            updateEvolutionChart();
        });
    }

    const evolutionMinScale = document.getElementById('evolutionMinScale');
    if (evolutionMinScale) {
        evolutionMinScale.addEventListener('change', (e) => {
            evolutionMinMode = e.target.checked ? 'min' : 'zero';
            updateEvolutionChart();
        });
    }

    document.getElementById('modalCancel').addEventListener('click', hideModal);

    // Snapshot action buttons (event delegation for ES module compatibility)
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const id = Number(btn.dataset.id);
        switch (btn.dataset.action) {
            case 'view': viewSnapshot(id); break;
            case 'copy': exportSnapshotToClipboard(snapshots.find(s => s.id === id)); break;
            case 'edit': openEditSnapshot(id); break;
            case 'delete': deleteSnapshot(id); break;
        }
    });

    // Cloud sync buttons
    const syncPullBtn = document.getElementById('syncPullBtn');
    if (syncPullBtn) syncPullBtn.addEventListener('click', () => syncPull(showToast));
    const syncPushBtn = document.getElementById('syncPushBtn');
    if (syncPushBtn) syncPushBtn.addEventListener('click', () => syncPush(showToast));

    document.getElementById('exportBtn').addEventListener('click', exportToJson);
    const exportLatestBtn = document.getElementById('exportLatestBtn');
    if (exportLatestBtn) {
        exportLatestBtn.addEventListener('click', exportLatestSnapshotToClipboard);
    }
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', importFromJson);

    document.getElementById('categorySelector').addEventListener('change', (e) => {
        selectedCategory = e.target.value || null;
        persistSelectedCategory();
        updateViewMode();
    });

    document.getElementById('closeEditModal').addEventListener('click', () => toggleEditModal(false));
    document.getElementById('cancelEdit').addEventListener('click', () => toggleEditModal(false));
    document.getElementById('saveEdit').addEventListener('click', saveEditedSnapshot);

    const monthlyBudgetInput = document.getElementById('monthlyBudget');
    if (monthlyBudgetInput) {
        monthlyBudgetInput.value = targetsMeta.monthlyBudget || 0;
        monthlyBudgetInput.addEventListener('input', (e) => {
            const value = Number.parseFloat(e.target.value) || 0;
            targetsMeta.monthlyBudget = Math.max(0, value);
            saveTargetsMeta();
            updateTargetsTable();
        });
    }

    const autoBalanceBtn = document.getElementById('autoBalanceBtn');
    if (autoBalanceBtn) {
        autoBalanceBtn.addEventListener('click', () => {
            autoBalanceTargets();
        });
    }

    const compositionCompare = document.getElementById('compositionCompare');
    if (compositionCompare) {
        compositionCompare.value = String(compositionCompareMonths);
        compositionCompare.addEventListener('change', (e) => {
            const value = Number.parseInt(e.target.value, 10);
            compositionCompareMonths = Number.isFinite(value) ? value : 1;
            updateCompositionList();
        });
    }

    const opportunityRange = document.getElementById('opportunityRange');
    if (opportunityRange) {
        opportunityRange.value = String(opportunityRangeMonths);
        opportunityRange.addEventListener('change', (e) => {
            const value = Number.parseInt(e.target.value, 10);
            opportunityRangeMonths = Number.isFinite(value) ? value : 1;
            updateOpportunities();
        });
    }

    const editSnapshotData = document.getElementById('editSnapshotData');
    if (editSnapshotData) {
        editSnapshotData.addEventListener('input', renderEditPreview);
    }
}

function loadTargets() {
    const stored = localStorage.getItem(TARGETS_KEY);
    categoryTargets = stored ? JSON.parse(stored) : {};
}

function saveTargets() {
    localStorage.setItem(TARGETS_KEY, JSON.stringify(categoryTargets));
    syncPush(null);
}

function loadTargetsMeta() {
    const stored = localStorage.getItem(TARGETS_META_KEY);
    targetsMeta = stored ? JSON.parse(stored) : { monthlyBudget: 0 };
}

function saveTargetsMeta() {
    localStorage.setItem(TARGETS_META_KEY, JSON.stringify(targetsMeta));
    syncPush(null);
}

function exportToJson() {
    if (snapshots.length === 0) {
        showToast('No hay datos para exportar', 'error');
        return;
    }
    // Export computed metrics? No, keep it clean as requested to compress "disaster"
    // Only export raw data
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

function exportLatestSnapshotToClipboard() {
    if (snapshots.length === 0) {
        showToast('No hay snapshots para exportar', 'error');
        return;
    }

    const latestSnapshot = snapshots[snapshots.length - 1];
    exportSnapshotToClipboard(latestSnapshot);
}

function exportSnapshotToClipboard(snapshot) {
    if (!snapshot) {
        showToast('Snapshot no encontrado', 'error');
        return;
    }

    const lines = snapshot.assets.map(asset => {
        const name = asset[AssetIndex.NAME];
        const term = asset[AssetIndex.TERM];
        const category = asset[AssetIndex.CATEGORY];
        const purchasePrice = asset[AssetIndex.PURCHASE_PRICE];
        const quantity = asset[AssetIndex.QUANTITY];
        const currentPrice = asset[AssetIndex.CURRENT_PRICE];
        return [
            name,
            term,
            category,
            formatNumberForExport(purchasePrice),
            formatNumberForExport(quantity),
            formatNumberForExport(currentPrice)
        ].join('\t');
    });

    const tsv = [...lines].join('\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(tsv)
            .then(() => showToast('Snapshot copiado al portapapeles', 'success'))
            .catch(() => fallbackCopyText(tsv));
    } else {
        fallbackCopyText(tsv);
    }
}

function formatNumberForExport(value) {
    const safeValue = Number.isFinite(value) ? value : 0;
    return safeValue.toLocaleString('es-ES', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6
    });
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

function importFromJson(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            if (Array.isArray(imported)) {
                // Determine if we need migration or calculation
                const processed = imported.map(s => {
                    // Migration check
                    let assets = s.assets;
                    if (assets.length > 0 && !Array.isArray(assets[0])) {
                        assets = s.assets.map(asset => [
                            asset.name, asset.term, asset.category,
                            asset.purchasePrice, asset.quantity, asset.currentPrice,
                            asset.purchaseValue, asset.currentValue
                        ]);
                    }

                    return calculateSnapshotMetrics({
                        id: s.id || Date.now(),
                        date: s.date,
                        assets: assets,
                        tag: s.tag || '',
                        note: s.note || ''
                    });
                });

                snapshots = processed;
                saveSnapshots();
                updateUI();
                showToast('Datos importados y optimizados', 'success');
            } else {
                throw new Error('Formato inválido');
            }
        } catch (err) {
            showToast('Error al importar el archivo JSON', 'error');
        }
    };
    reader.readAsText(file);
}

function parseData(rawData) {
    const lines = rawData.trim().split('\n').filter(line => line.trim());
    const assets = [];

    for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length >= 8) {
            // Store as array based on AssetIndex
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
    }

    return assets;
}

function parseEuroValue(str) {
    if (!str) return 0;
    return parseFloat(str.replace('€', '').replace('.', '').replace(',', '.').trim()) || 0;
}

function parseNumber(str) {
    if (!str) return 0;
    return parseFloat(str.replace('.', '').replace(',', '.').trim()) || 0;
}

function captureSnapshot() {
    const input = document.getElementById('snapshotData').value;
    const dateValue = document.getElementById('snapshotDate').value;
    const tagValue = document.getElementById('snapshotTag')?.value || '';
    const noteValue = document.getElementById('snapshotNote')?.value || '';

    if (!input.trim()) {
        showToast('Por favor, pega los datos de tu cartera', 'error');
        return;
    }

    if (!dateValue) {
        showToast('Por favor, selecciona una fecha', 'error');
        return;
    }

    const assets = parseData(input);
    if (assets.length === 0) {
        showToast('No se pudieron parsear los datos. Verifica el formato.', 'error');
        return;
    }

    const snapshotRaw = {
        id: Date.now(),
        date: new Date(dateValue).toISOString(),
        assets,
        tag: tagValue.trim(),
        note: noteValue.trim()
    };

    const snapshot = calculateSnapshotMetrics(snapshotRaw);

    snapshots.push(snapshot);
    snapshots.sort((a, b) => new Date(a.date) - new Date(b.date));

    saveSnapshots();
    updateUI();
    document.getElementById('snapshotData').value = '';
    const tagInput = document.getElementById('snapshotTag');
    const noteInput = document.getElementById('snapshotNote');
    if (tagInput) tagInput.value = '';
    if (noteInput) noteInput.value = '';
    toggleCaptureModal(false);
    showToast('Snapshot guardado', 'success');
}

function selectCategory(category) {
    selectedCategory = category;
    document.getElementById('categorySelector').value = category || '';
    persistSelectedCategory();
    updateViewMode();
}

function loadSelectedCategory() {
    const stored = localStorage.getItem(SELECTED_CATEGORY_KEY);
    if (!stored) return;

    if (snapshots.length === 0) {
        selectedCategory = null;
        return;
    }

    const latestSnapshot = snapshots[snapshots.length - 1];
    const categories = Object.keys(latestSnapshot.categoryTotals || {});
    selectedCategory = categories.includes(stored) ? stored : null;
}

function persistSelectedCategory() {
    if (selectedCategory) {
        localStorage.setItem(SELECTED_CATEGORY_KEY, selectedCategory);
    } else {
        localStorage.removeItem(SELECTED_CATEGORY_KEY);
    }
}

function updateViewMode() {
    const heroLabel = document.getElementById('heroLabel');
    const evolutionTitle = document.getElementById('evolutionTitle');
    const topItemsTitle = document.getElementById('topItemsTitle');
    const topItemsHead = document.getElementById('topItemsHead');
    const diversificationTitle = document.getElementById('diversificationTitle');

    if (selectedCategory) {
        heroLabel.textContent = selectedCategory;
        evolutionTitle.textContent = 'Evolución de ' + selectedCategory;
        topItemsTitle.textContent = 'Top 5 Activos';
        topItemsHead.innerHTML = `<tr><th>Activo</th><th>Valor</th><th>Invertido</th><th>ROI</th></tr>`;
        diversificationTitle.textContent = 'Composición de ' + selectedCategory;
    } else {
        heroLabel.textContent = 'Valor Total';
        evolutionTitle.textContent = 'Evolución';
        topItemsTitle.textContent = 'Top 5 Categorías';
        topItemsHead.innerHTML = `<tr><th>Categoría</th><th>Valor</th><th>Invertido</th><th>ROI</th></tr>`;
        diversificationTitle.textContent = 'Diversificación Histórica';
    }

    updateSummary();
    updateEvolutionChart();
    updateDistributionCharts();
    updateCategoryRoiTable();
    updateTopAssetsTable();
    updateAnalytics();
    updateCompositionList();
}

function toggleEditModal(show) {
    document.getElementById('editModal').classList.toggle('show', show);
}

function openEditSnapshot(snapshotId) {
    const snapshot = snapshots.find(s => s.id === snapshotId);
    if (!snapshot) return;

    document.getElementById('editSnapshotId').value = snapshotId;
    document.getElementById('editSnapshotDate').value = snapshot.date.split('T')[0];
    const editTag = document.getElementById('editSnapshotTag');
    const editNote = document.getElementById('editSnapshotNote');
    if (editTag) editTag.value = snapshot.tag || '';
    if (editNote) editNote.value = snapshot.note || '';

    const lines = snapshot.assets.map(a => {
        return [
            a[AssetIndex.NAME],
            a[AssetIndex.TERM],
            a[AssetIndex.CATEGORY],
            a[AssetIndex.PURCHASE_PRICE].toFixed(2).replace('.', ',') + ' €',
            a[AssetIndex.QUANTITY].toString().replace('.', ','),
            a[AssetIndex.CURRENT_PRICE].toFixed(2).replace('.', ',') + ' €',
            a[AssetIndex.PURCHASE_VALUE].toFixed(2).replace('.', ',') + ' €',
            a[AssetIndex.CURRENT_VALUE].toFixed(2).replace('.', ',') + ' €'
        ].join('\t');
    }).join('\n');

    document.getElementById('editSnapshotData').value = lines;
    renderEditPreview();
    toggleEditModal(true);
}

function renderEditPreview() {
    const tbody = document.getElementById('editPreviewBody');
    const countEl = document.getElementById('editPreviewCount');
    const textarea = document.getElementById('editSnapshotData');
    if (!tbody || !textarea) return;

    const raw = textarea.value.trim();
    if (!raw) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Sin datos</td></tr>';
        if (countEl) countEl.textContent = '0 filas';
        return;
    }

    const lines = raw.split('\n').filter(line => line.trim());
    if (countEl) countEl.textContent = `${lines.length} fila${lines.length === 1 ? '' : 's'}`;

    const rows = lines.map(line => {
        const parts = line.split('\t');
        return {
            name: parts[0] ? parts[0].trim() : '- ',
            term: parts[1] ? parts[1].trim() : '- ',
            category: parts[2] ? parts[2].trim() : '- ',
            purchasePrice: parts[3] ? parts[3].trim() : '- ',
            quantity: parts[4] ? parts[4].trim() : '- ',
            currentPrice: parts[5] ? parts[5].trim() : '- '
        };
    });

    tbody.innerHTML = rows.map(row => `
        <tr>
            <td>${row.name}</td>
            <td>${row.term}</td>
            <td>${row.category}</td>
            <td>${row.purchasePrice}</td>
            <td>${row.quantity}</td>
            <td>${row.currentPrice}</td>
        </tr>
    `).join('');
}

function saveEditedSnapshot() {
    const snapshotId = parseInt(document.getElementById('editSnapshotId').value);
    const dateValue = document.getElementById('editSnapshotDate').value;
    const input = document.getElementById('editSnapshotData').value;
    const tagValue = document.getElementById('editSnapshotTag')?.value || '';
    const noteValue = document.getElementById('editSnapshotNote')?.value || '';

    if (!input.trim() || !dateValue) {
        showToast('Los campos no pueden estar vacíos', 'error');
        return;
    }

    const assets = parseData(input);
    if (assets.length === 0) {
        showToast('No se pudieron parsear los datos. Verifica el formato.', 'error');
        return;
    }

    const index = snapshots.findIndex(s => s.id === snapshotId);
    if (index === -1) return;

    const snapshotRaw = {
        id: snapshotId,
        date: new Date(dateValue).toISOString(),
        assets,
        tag: tagValue.trim(),
        note: noteValue.trim()
    };

    snapshots[index] = calculateSnapshotMetrics(snapshotRaw);
    snapshots.sort((a, b) => new Date(a.date) - new Date(b.date));

    saveSnapshots();
    updateUI();
    toggleEditModal(false);
    showToast('Snapshot actualizado', 'success');
}

function updateUI() {
    populateCategorySelector();
    updateSummary();
    updateHistoryTable();
    updateEvolutionChart();
    updateDistributionCharts();
    updateCategoryRoiTable();
    updateTopAssetsTable();
    updateAnalytics();
    updateTargetsTable();
}

function populateCategorySelector() {
    const selector = document.getElementById('categorySelector');
    const currentValue = selectedCategory || selector.value;

    let options = '<option value="">Portfolio Global</option>';

    if (snapshots.length > 0) {
        const latestSnapshot = snapshots[snapshots.length - 1];
        const categories = Object.keys(latestSnapshot.categoryTotals).sort();
        categories.forEach(cat => {
            const selected = cat === currentValue ? 'selected' : '';
            options += `<option value="${cat}" ${selected}>${cat}</option>`;
        });
    }

    selector.innerHTML = options;
    selector.value = currentValue || '';
}

function updateAnalytics() {
    if (snapshots.length === 0) return;
    const latestSnapshot = snapshots[snapshots.length - 1];
    const rangeSnapshots = getSnapshotsForRange();
    const monthlyData = getMonthlySnapshotsForRange();

    let assetsToAnalyze, totalValue, totalPurchase;

    if (selectedCategory) {
        assetsToAnalyze = latestSnapshot.assets.filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
        totalValue = assetsToAnalyze.reduce((s, a) => s + a[AssetIndex.CURRENT_VALUE], 0);
        totalPurchase = assetsToAnalyze.reduce((s, a) => s + a[AssetIndex.PURCHASE_VALUE], 0);
    } else {
        assetsToAnalyze = null;
        totalValue = latestSnapshot.totalCurrentValue;
        totalPurchase = latestSnapshot.totalPurchaseValue;
    }

    // 1. Max Drawdown (basado en ROI acumulado de cierres mensuales)
    let peakRoi = -Infinity;
    let maxDrawdown = 0;
    monthlyData.forEach(s => {
        let val, invested;
        if (selectedCategory) {
            const catAssets = s.assets.filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
            val = catAssets.reduce((sum, a) => sum + a[AssetIndex.CURRENT_VALUE], 0);
            invested = catAssets.reduce((sum, a) => sum + a[AssetIndex.PURCHASE_VALUE], 0);
        } else {
            val = s.totalCurrentValue;
            invested = s.totalPurchaseValue;
        }
        const roi = invested > 0 ? ((val - invested) / invested) * 100 : 0;
        if (roi > peakRoi) peakRoi = roi;
        const drawdown = roi - peakRoi;
        if (drawdown < maxDrawdown) maxDrawdown = drawdown;
    });
    document.getElementById('maxDrawdown').textContent = maxDrawdown.toFixed(2) + '%';
    document.getElementById('maxDrawdown').className = 'kpi-value ' + (maxDrawdown < -5 ? 'negative' : '');

    // 2. Best/Worst Item & Win Rate (siempre sobre la foto actual)
    let bestItem = { name: '-', roi: -Infinity };
    let worstItem = { name: '-', roi: Infinity };
    let profitableCount = 0;
    let totalItems = 0;

    if (selectedCategory) {
        assetsToAnalyze.forEach(a => {
            const invested = a[AssetIndex.PURCHASE_VALUE];
            const current = a[AssetIndex.CURRENT_VALUE];
            const roi = invested > 0 ? (current - invested) / invested : 0;
            if (roi > bestItem.roi) bestItem = { name: a[AssetIndex.NAME], roi };
            if (roi < worstItem.roi) worstItem = { name: a[AssetIndex.NAME], roi };
            if (roi >= 0) profitableCount++;
            totalItems++;
        });
    } else {
        const categories = Object.keys(latestSnapshot.categoryTotals);
        categories.forEach(cat => {
            const catAssets = latestSnapshot.assets.filter(a => a[AssetIndex.CATEGORY] === cat);
            const value = catAssets.reduce((s, a) => s + a[AssetIndex.CURRENT_VALUE], 0);
            const invested = catAssets.reduce((s, a) => s + a[AssetIndex.PURCHASE_VALUE], 0);
            const roi = invested > 0 ? (value - invested) / invested : 0;
            if (roi > bestItem.roi) bestItem = { name: cat, roi };
            if (roi < worstItem.roi) worstItem = { name: cat, roi };
            if (roi >= 0) profitableCount++;
            totalItems++;
        });
    }

    const winRate = totalItems > 0 ? (profitableCount / totalItems) * 100 : 0;

    document.getElementById('bestAsset').textContent = bestItem.name.length > 15 ? bestItem.name.substring(0, 12) + '...' : bestItem.name;
    document.getElementById('bestAssetRoi').textContent = (bestItem.roi * 100).toFixed(1) + '% ROI';
    document.getElementById('bestAssetRoi').className = 'kpi-desc ' + (bestItem.roi >= 0 ? 'positive' : 'negative');

    const worstAssetEl = document.getElementById('worstAsset');
    if (worstAssetEl) {
        worstAssetEl.textContent = worstItem.name.length > 15 ? worstItem.name.substring(0, 12) + '...' : worstItem.name;
        document.getElementById('worstAssetRoi').textContent = (worstItem.roi * 100).toFixed(1) + '% ROI';
        document.getElementById('worstAssetRoi').className = 'kpi-desc ' + (worstItem.roi >= 0 ? 'positive' : 'negative');
    }

    document.getElementById('winRate').textContent = winRate.toFixed(0) + '%';
    document.getElementById('winRate').className = 'kpi-value ' + (winRate >= 50 ? 'positive' : 'negative');

    // 3. Projected Annual Value using real CAGR (basado en primer y último snapshot del rango)
    let cagr = 0.07;
    if (rangeSnapshots.length >= 2) {
        const firstSnapshot = rangeSnapshots[0];
        const firstDate = new Date(firstSnapshot.date);
        const lastDate = new Date(latestSnapshot.date);
        const years = (lastDate - firstDate) / (1000 * 60 * 60 * 24 * 365);

        if (years > 0.01 && firstSnapshot.totalPurchaseValue > 0) {
            const totalReturn = latestSnapshot.totalCurrentValue / firstSnapshot.totalPurchaseValue;
            cagr = Math.pow(totalReturn, 1 / years) - 1;
            cagr = Math.max(-0.5, Math.min(cagr, 1));
        }
    }

    const projected = latestSnapshot.totalCurrentValue * (1 + cagr);
    document.getElementById('projectedValue').textContent = formatCurrency(projected);

    const cagrEl = document.getElementById('projectedCagr');
    if (cagrEl) {
        cagrEl.textContent = `CAGR: ${(cagr * 100).toFixed(1)}%`;
        cagrEl.className = 'kpi-desc ' + (cagr >= 0 ? 'positive' : 'negative');
    }

    // 4. Volatilidad anualizada y mejor mes (por rango)
    const labels = monthlyData.map(s => {
        const date = new Date(s.date);
        return date.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
    });

    const getValues = (snapshot) => {
        if (selectedCategory) {
            const catAssets = snapshot.assets.filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
            const value = catAssets.reduce((sum, a) => sum + a[AssetIndex.CURRENT_VALUE], 0);
            const invested = catAssets.reduce((sum, a) => sum + a[AssetIndex.PURCHASE_VALUE], 0);
            return { value, invested };
        }
        return { value: snapshot.totalCurrentValue, invested: snapshot.totalPurchaseValue };
    };

    const periodReturns = monthlyData.map((s, i) => {
        const { value, invested } = getValues(s);
        if (i === 0) return 0;
        const prev = monthlyData[i - 1];
        const { value: prevValue, invested: prevInvested } = getValues(prev);
        const newInvestment = invested - prevInvested;
        const actualGain = value - prevValue - newInvestment;
        return prevValue > 0 ? (actualGain / prevValue) * 100 : 0;
    });

    const validReturns = periodReturns.slice(1).filter(v => Number.isFinite(v));
    const avg = validReturns.length ? validReturns.reduce((a, b) => a + b, 0) / validReturns.length : 0;
    const variance = validReturns.length
        ? validReturns.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / validReturns.length
        : 0;
    const monthlyStd = Math.sqrt(variance);
    const annualizedVol = monthlyStd * Math.sqrt(12);

    const volatilityEl = document.getElementById('volatility');
    if (volatilityEl) {
        volatilityEl.textContent = annualizedVol.toFixed(1) + '%';
    }

    let bestIdx = -1;
    let bestValue = -Infinity;
    validReturns.forEach((val, i) => {
        const idx = i + 1;
        if (val > bestValue) {
            bestValue = val;
            bestIdx = idx;
        }
    });

    const bestMonthEl = document.getElementById('bestMonth');
    const bestMonthReturnEl = document.getElementById('bestMonthReturn');
    if (bestMonthEl && bestMonthReturnEl) {
        if (bestIdx >= 0) {
            bestMonthEl.textContent = labels[bestIdx] || '-';
            bestMonthReturnEl.textContent = `Mejor mes: ${bestValue >= 0 ? '+' : ''}${bestValue.toFixed(1)}%`;
            bestMonthReturnEl.className = 'kpi-desc ' + (bestValue >= 0 ? 'positive' : 'negative');
        } else {
            bestMonthEl.textContent = '-';
            bestMonthReturnEl.textContent = 'Mejor mes';
            bestMonthReturnEl.className = 'kpi-desc';
        }
    }

    updateCompositionList();
    updateOpportunities();
}

function updateOpportunities() {
    const container = document.getElementById('opportunityList');
    if (!container || snapshots.length === 0) return;

    const latestSnapshot = snapshots[snapshots.length - 1];
    const normalizeKey = (value) => (value || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
    const monthlySnapshots = getMonthlySnapshotsForRange();
    const windowSize = Math.max(opportunityRangeMonths + 1, 3);
    const windowSnapshots = monthlySnapshots.slice(-Math.min(monthlySnapshots.length, windowSize));

    if (windowSnapshots.length < 2) {
        container.innerHTML = '<div class="opportunity-empty">Sin datos suficientes para comparar.</div>';
        return;
    }

    const calcSeriesStats = (series) => {
        const returns = [];
        for (let i = 1; i < series.length; i++) {
            const prev = series[i - 1];
            const curr = series[i];
            if (!prev || !curr || prev.value <= 0) continue;
            const newInvestment = curr.invested - prev.invested;
            const actualGain = curr.value - prev.value - newInvestment;
            const ret = (actualGain / prev.value) * 100;
            if (Number.isFinite(ret)) returns.push(ret);
        }

        const validReturns = returns.filter(v => Number.isFinite(v));
        const mean = validReturns.length ? validReturns.reduce((a, b) => a + b, 0) / validReturns.length : 0;
        const variance = validReturns.length
            ? validReturns.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / validReturns.length
            : 0;
        const std = Math.sqrt(variance);

        const first = series[0];
        const last = series[series.length - 1];
        const base = first && first.value > 0 ? first.value : 0;
        const netInvestment = last ? (last.invested - (first ? first.invested : 0)) : 0;
        const netGain = last ? (last.value - (first ? first.value : 0) - netInvestment) : 0;
        const trend = base > 0 ? (netGain / base) * 100 : 0;
        const netFlowPct = base > 0 ? (netInvestment / base) * 100 : 0;

        const maxValue = series.reduce((max, point) => Math.max(max, point.value || 0), 0) || 0;
        const drawdown = maxValue > 0 && last ? ((last.value - maxValue) / maxValue) * 100 : 0;

        const lastReturn = validReturns.length ? validReturns[validReturns.length - 1] : 0;
        const zScore = std > 0 ? (lastReturn - mean) / std : 0;

        return { lastReturn, mean, std, zScore, trend, drawdown, netInvestment, netFlowPct };
    };

    let items = [];
    const latestAssets = selectedCategory
        ? latestSnapshot.assets.filter(a => normalizeKey(a[AssetIndex.CATEGORY]) === normalizeKey(selectedCategory))
        : latestSnapshot.assets;
    const latestNames = latestAssets.map(a => a[AssetIndex.NAME]);

    items = latestNames.map(name => {
        const series = windowSnapshots.map(s => {
            const found = s.assets.find(a => normalizeKey(a[AssetIndex.NAME]) === normalizeKey(name)
                && (!selectedCategory || normalizeKey(a[AssetIndex.CATEGORY]) === normalizeKey(selectedCategory)));
            return {
                value: found ? found[AssetIndex.CURRENT_VALUE] : 0,
                invested: found ? found[AssetIndex.PURCHASE_VALUE] : 0
            };
        });
        return { label: name, stats: calcSeriesStats(series) };
    });

    items = items.map(item => {
        const { lastReturn, zScore, trend, drawdown, netFlowPct, netInvestment } = item.stats;
        const tags = [];
        if (netFlowPct <= -2) tags.push('Venta neta');
        if (zScore <= -1.2 && lastReturn < 0) tags.push('Caída atípica');
        if (zScore >= 1.2 && lastReturn > 0) tags.push('Impulso fuerte');
        if (drawdown <= -12 && netInvestment >= 0) tags.push('Drawdown alto');
        if (trend >= 8 && lastReturn >= 0) tags.push('Tendencia positiva');
        if (trend <= -8 && lastReturn <= 0) tags.push('Tendencia negativa');

        const flowPenalty = netInvestment < 0 ? 0.6 : 1;
        const score = Math.max(Math.abs(zScore), Math.abs(drawdown) / 10, Math.abs(trend) / 10) * flowPenalty;
        return { ...item, tags, score };
    });

    const ranked = items
        .filter(item => item.tags.length > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);

    if (ranked.length === 0) {
        container.innerHTML = '<div class="opportunity-empty">Sin señales destacadas en el periodo.</div>';
        return;
    }

    container.innerHTML = ranked.map(item => {
        const { lastReturn, zScore, trend, drawdown, netFlowPct } = item.stats;
        const changeClass = lastReturn >= 0 ? 'positive' : 'negative';
        const arrow = lastReturn >= 0 ? '↑' : '↓';
        const tagsHtml = item.tags.map(tag => {
            const tagClass = tag.includes('negativa') || tag.includes('Caída') || tag.includes('Drawdown') ? 'negative' : 'positive';
            return `<span class="opportunity-tag ${tagClass}">${tag}</span>`;
        }).join('');

        return `
            <div class="opportunity-item">
                <div class="opportunity-info">
                    <span class="opportunity-label">${item.label}</span>
                    <span class="opportunity-desc">
                        Último periodo: ${lastReturn >= 0 ? '+' : ''}${lastReturn.toFixed(2)}% ·
                        Tendencia: ${trend >= 0 ? '+' : ''}${trend.toFixed(2)}% ·
                        Flujo neto: ${netFlowPct >= 0 ? '+' : ''}${netFlowPct.toFixed(2)}% ·
                        Drawdown: ${drawdown.toFixed(1)}% ·
                        Z: ${zScore.toFixed(2)}
                    </span>
                    <div class="opportunity-tags">${tagsHtml}</div>
                </div>
                <span class="opportunity-change ${changeClass}">${arrow} ${Math.abs(lastReturn).toFixed(2)}%</span>
            </div>
        `;
    }).join('');
}

function calculateVolatility(returns) {
    if (!returns || returns.length < 2) return null;
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance) * Math.sqrt(12) * 100;
}

function calculateMaxDrawdown(values) {
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

function updateCategoryRoiTable() {
    const tbody = document.getElementById('categoryRoiBody');
    const title = document.getElementById('categoryRoiTitle');
    const thead = document.getElementById('categoryRoiHead');
    const latestSnapshot = snapshots[snapshots.length - 1];

    if (!latestSnapshot) {
        tbody.innerHTML = '';
        return;
    }

    if (selectedCategory) {
        title.textContent = 'Rendimiento por Activo';
        thead.innerHTML = '<tr><th>Activo</th><th>Invertido</th><th>Valor</th><th>ROI</th></tr>';

        const assets = latestSnapshot.assets.filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
        const assetData = assets.map(a => {
            const invested = a[AssetIndex.PURCHASE_VALUE];
            const current = a[AssetIndex.CURRENT_VALUE];
            const roi = invested > 0 ? ((current - invested) / invested * 100) : 0;
            return { name: a[AssetIndex.NAME], invested, current, roi };
        });

        assetData.sort((a, b) => b.roi - a.roi);

        tbody.innerHTML = assetData.map(({ name, invested, current, roi }) => {
            const roiClass = roi >= 0 ? 'positive' : 'negative';
            return `
                <tr>
                    <td><strong>${name.length > 20 ? name.substring(0, 17) + '...' : name}</strong></td>
                    <td>${formatCurrency(invested)}</td>
                    <td>${formatCurrency(current)}</td>
                    <td class="${roiClass}"><strong>${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%</strong></td>
                </tr>
            `;
        }).join('');
    } else {
        title.textContent = 'Rendimiento por Categoría';
        thead.innerHTML = '<tr><th>Categoría</th><th>Invertido</th><th>Valor</th><th>ROI</th><th>Volatilidad</th><th>Drawdown</th></tr>';

        const monthlySnapshots = getMonthlySnapshotsForRange();

        const categories = Object.keys(latestSnapshot.categoryTotals);
        const categoryData = categories.map(cat => {
            const invested = latestSnapshot.categoryInvested[cat] || 0;
            const current = latestSnapshot.categoryTotals[cat] || 0;
            const roi = invested > 0 ? ((current - invested) / invested * 100) : 0;
            const values = monthlySnapshots.map(s => {
                const catAssets = s.assets.filter(a => a[AssetIndex.CATEGORY] === cat);
                return catAssets.reduce((sum, a) => sum + a[AssetIndex.CURRENT_VALUE], 0);
            });
            const returns = values.slice(1).map((value, i) => {
                const prev = values[i];
                return prev > 0 ? (value - prev) / prev : 0;
            });
            const volatility = calculateVolatility(returns);
            const drawdown = calculateMaxDrawdown(values);

            return { cat, invested, current, roi, volatility, drawdown };
        });

        categoryData.sort((a, b) => b.roi - a.roi);

        tbody.innerHTML = categoryData.map(({ cat, invested, current, roi, volatility, drawdown }) => {
            const roiClass = roi >= 0 ? 'positive' : 'negative';
            const categoryClass = cat.replace(/\s+/g, '');
            const volatilityText = Number.isFinite(volatility) ? `${volatility.toFixed(1)}%` : '—';
            const drawdownText = Number.isFinite(drawdown) ? `${drawdown.toFixed(1)}%` : '—';
            const drawdownClass = Number.isFinite(drawdown) && drawdown < 0 ? 'negative' : 'positive';
            return `
                <tr>
                    <td><span class="category-badge category-${categoryClass}">${cat}</span></td>
                    <td>${formatCurrency(invested)}</td>
                    <td>${formatCurrency(current)}</td>
                    <td class="${roiClass}"><strong>${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%</strong></td>
                    <td class="metric-muted">${volatilityText}</td>
                    <td class="${drawdownClass}">${drawdownText}</td>
                </tr>
            `;
        }).join('');
    }
}

function updateTargetsTable() {
    const tbody = document.getElementById('targetsBody');
    const monthlyTotalEl = document.getElementById('monthlyTotal');
    const targetsTotalIndicator = document.getElementById('targetsTotalIndicator');
    const targetsHead = document.querySelector('.targets-section thead');
    if (!tbody || !monthlyTotalEl) return;

    if (snapshots.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Sin datos</td></tr>';
        monthlyTotalEl.textContent = formatCurrency(0);
        if (targetsHead) {
            targetsHead.innerHTML = '<tr><th>Categoría</th><th>Actual %</th><th>Objetivo %</th><th>Diferencia</th><th>Aporte mensual</th><th>Impacto</th></tr>';
        }
        if (targetsChart) {
            targetsChart.data = { labels: [], datasets: [] };
            targetsChart.update();
        }
        return;
    }

    const latestSnapshot = snapshots[snapshots.length - 1];

    if (selectedCategory) {
        const assets = latestSnapshot.assets.filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
        const totalValue = assets.reduce((sum, a) => sum + a[AssetIndex.CURRENT_VALUE], 0) || 1;
        const assetTargets = categoryTargets[selectedCategory]?.assets || {};

        const rows = assets.map(asset => {
            const name = asset[AssetIndex.NAME];
            const currentValue = asset[AssetIndex.CURRENT_VALUE] || 0;
            const currentPct = (currentValue / totalValue) * 100;
            const target = assetTargets[name]?.target ?? 0;
            const diff = target - currentPct;
            return {
                name,
                currentPct,
                target,
                diff,
                gapAbs: Math.abs(diff)
            };
        });

        rows.sort((a, b) => {
            if (b.gapAbs !== a.gapAbs) return b.gapAbs - a.gapAbs;
            return a.name.localeCompare(b.name, 'es');
        });

        if (targetsHead) {
            targetsHead.innerHTML = '<tr><th>Activo</th><th>Actual %</th><th>Objetivo %</th><th>Diferencia</th></tr>';
        }

        const sumTargets = rows.reduce((sum, row) => sum + row.target, 0);
        const deltaTo100 = 100 - sumTargets;
        if (targetsTotalIndicator) {
            const sign = deltaTo100 >= 0 ? 'Falta' : 'Sobra';
            targetsTotalIndicator.textContent = `Objetivos activos: ${sumTargets.toFixed(1)}% · ${sign} ${Math.abs(deltaTo100).toFixed(1)}%`;
            targetsTotalIndicator.className = `targets-indicator ${Math.abs(deltaTo100) < 0.1 ? 'ok' : 'warn'}`;
        }
        monthlyTotalEl.textContent = formatCurrency(0);

        tbody.innerHTML = rows.map(row => {
            const diffClass = row.diff >= 0 ? 'positive' : 'negative';
            return `
                <tr>
                    <td><strong>${row.name.length > 22 ? row.name.substring(0, 19) + '...' : row.name}</strong></td>
                    <td>${row.currentPct.toFixed(1)}%</td>
                    <td>
                        <input class="table-input asset-target-input" type="number" min="0" max="100" step="0.1" data-asset="${row.name}" value="${row.target}">
                    </td>
                    <td class="${diffClass}">${row.diff >= 0 ? '+' : ''}${row.diff.toFixed(1)}%</td>
                </tr>
            `;
        }).join('');

        if (targetsChart) {
            const labels = rows.map(row => row.name);
            const currentData = rows.map(row => Number(row.currentPct.toFixed(1)));
            const targetData = rows.map(row => Number(row.target.toFixed(1)));

            targetsChart.data = {
                labels,
                datasets: [
                    {
                        label: 'Actual %',
                        data: currentData,
                        backgroundColor: 'rgba(0, 113, 227, 0.35)',
                        borderColor: '#0071e3',
                        borderWidth: 1,
                        borderRadius: 8,
                        barThickness: 14
                    },
                    {
                        label: 'Objetivo %',
                        type: 'line',
                        data: targetData,
                        borderColor: '#ff9f0a',
                        pointBackgroundColor: '#ff9f0a',
                        pointRadius: 4,
                        pointHoverRadius: 5,
                        showLine: false
                    }
                ]
            };
            targetsChart.update();
        }

        tbody.querySelectorAll('.asset-target-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const assetName = e.target.dataset.asset;
                const value = Number.parseFloat(e.target.value) || 0;
                categoryTargets[selectedCategory] = {
                    ...(categoryTargets[selectedCategory] || {}),
                    assets: {
                        ...((categoryTargets[selectedCategory] || {}).assets || {}),
                        [assetName]: { target: Math.max(0, Math.min(100, value)) }
                    }
                };
                saveTargets();
                updateTargetsTable();
            });
        });

        return;
    }

    const categories = Object.keys(latestSnapshot.categoryTotals);
    const totalValue = categories.reduce((sum, cat) => sum + (latestSnapshot.categoryTotals[cat] || 0), 0);
    const sumTargets = categories.reduce((sum, cat) => sum + (categoryTargets[cat]?.target ?? 0), 0) || 1;
    const totalMonthlyAll = categories.reduce((sum, cat) => sum + (categoryTargets[cat]?.monthly ?? 0), 0);

    let monthlyTotal = 0;

    const rows = categories.map(cat => {
        const currentValue = latestSnapshot.categoryTotals[cat] || 0;
        const currentPct = totalValue > 0 ? (currentValue / totalValue) * 100 : 0;
        const target = categoryTargets[cat]?.target ?? 0;
        const monthly = categoryTargets[cat]?.monthly ?? 0;
        const diff = target - currentPct;

        const projectedValue = currentValue + monthly;
        const projectedTotal = totalValue + totalMonthlyAll;
        const projectedPct = projectedTotal > 0 ? (projectedValue / projectedTotal) * 100 : currentPct;
        const beforeGap = Math.abs(target - currentPct);
        const afterGap = Math.abs(target - projectedPct);
        const gapDelta = beforeGap - afterGap;

        let impactLabel = 'Neutral';
        let impactClass = 'impact-neutral';
        let impactScore = 0;

        impactLabel = `${gapDelta >= 0 ? '+' : '-'}${Math.abs(gapDelta).toFixed(2)}pp`;
        if (monthly > 0 && totalMonthlyAll > 0) {
            if (gapDelta > 0) {
                impactClass = 'impact-positive';
                impactScore = 1;
            } else if (gapDelta < 0) {
                impactClass = 'impact-negative';
                impactScore = -1;
            }
        }

        const baseMonthly = totalMonthlyAllocationForTarget(target, sumTargets, targetsMeta.monthlyBudget || 0);

        return {
            cat,
            currentPct,
            target,
            diff,
            monthly,
            baseMonthly,
            impactLabel,
            impactClass,
            impactScore,
            gapAbs: Math.abs(diff)
        };
    });

    const targetsSum = rows.reduce((sum, row) => sum + row.target, 0);
    const deltaTo100 = 100 - targetsSum;
    if (targetsHead) {
        targetsHead.innerHTML = '<tr><th>Categoría</th><th>Actual %</th><th>Objetivo %</th><th>Diferencia</th><th>Aporte mensual</th><th>Impacto</th></tr>';
    }
    if (targetsTotalIndicator) {
        const sign = deltaTo100 >= 0 ? 'Falta' : 'Sobra';
        targetsTotalIndicator.textContent = `Objetivos: ${targetsSum.toFixed(1)}% · ${sign} ${Math.abs(deltaTo100).toFixed(1)}%`;
        targetsTotalIndicator.className = `targets-indicator ${Math.abs(deltaTo100) < 0.1 ? 'ok' : 'warn'}`;
    }

    rows.sort((a, b) => {
        if (b.currentPct !== a.currentPct) return b.currentPct - a.currentPct;
        return a.cat.localeCompare(b.cat, 'es');
    });

    if (targetsChart) {
        const rowsByGap = [...rows].sort((a, b) => b.gapAbs - a.gapAbs);
        const labels = rowsByGap.map(row => row.cat);
        const currentData = rowsByGap.map(row => Number(row.currentPct.toFixed(1)));
        const targetData = rowsByGap.map(row => Number(row.target.toFixed(1)));

        targetsChart.data = {
            labels,
            datasets: [
                {
                    label: 'Actual %',
                    data: currentData,
                    backgroundColor: 'rgba(0, 113, 227, 0.35)',
                    borderColor: '#0071e3',
                    borderWidth: 1,
                    borderRadius: 8,
                    barThickness: 14
                },
                {
                    label: 'Objetivo %',
                    type: 'line',
                    data: targetData,
                    borderColor: '#ff9f0a',
                    pointBackgroundColor: '#ff9f0a',
                    pointRadius: 4,
                    pointHoverRadius: 5,
                    showLine: false
                }
            ]
        };
        targetsChart.update();
    }

    tbody.innerHTML = rows.map(row => {
        monthlyTotal += row.monthly;
        const diffClass = row.diff >= 0 ? 'positive' : 'negative';
        return `
            <tr>
                <td><strong>${row.cat}</strong></td>
                <td>${row.currentPct.toFixed(1)}%</td>
                <td>
                    <input class="table-input target-input" type="number" min="0" max="100" step="0.1" data-cat="${row.cat}" value="${row.target}">
                </td>
                <td class="${diffClass}">${row.diff >= 0 ? '+' : ''}${row.diff.toFixed(1)}%</td>
                <td>
                    <input class="table-input monthly-input" type="number" min="0" step="1" data-cat="${row.cat}" value="${row.monthly}">
                    <div class="target-hint">Base: ${formatCurrency(row.baseMonthly)} · Final: ${formatCurrency(row.monthly)}</div>
                </td>
                <td>
                    <span class="impact-chip ${row.impactClass}">${row.impactLabel}</span>
                </td>
            </tr>
        `;
    }).join('');

    monthlyTotalEl.textContent = formatCurrency(monthlyTotal);

    tbody.querySelectorAll('.target-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const cat = e.target.dataset.cat;
            const value = Number.parseFloat(e.target.value) || 0;
            categoryTargets[cat] = {
                ...(categoryTargets[cat] || {}),
                target: Math.max(0, Math.min(100, value))
            };
            saveTargets();
            updateTargetsTable();
        });
    });

    tbody.querySelectorAll('.monthly-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const cat = e.target.dataset.cat;
            const value = Number.parseFloat(e.target.value) || 0;
            categoryTargets[cat] = {
                ...(categoryTargets[cat] || {}),
                monthly: Math.max(0, value)
            };
            saveTargets();
            updateTargetsTable();
        });
    });
}

function autoBalanceTargets() {
    if (snapshots.length === 0) return;

    const latestSnapshot = snapshots[snapshots.length - 1];
    const categories = Object.keys(latestSnapshot.categoryTotals);
    const totalValue = categories.reduce((sum, cat) => sum + (latestSnapshot.categoryTotals[cat] || 0), 0);
    const totalMonthly = targetsMeta.monthlyBudget || 0;

    if (totalMonthly <= 0 || totalValue <= 0) return;

    const sumTargets = categories.reduce((sum, cat) => sum + (categoryTargets[cat]?.target ?? 0), 0) || 1;
    const minFloorRatio = 0.25;
    const adjustFactor = 0.6;

    const weights = categories.map(cat => {
        const currentValue = latestSnapshot.categoryTotals[cat] || 0;
        const currentPct = totalValue > 0 ? (currentValue / totalValue) * 100 : 0;
        const target = categoryTargets[cat]?.target ?? 0;
        const baseWeight = Math.max(target, 0);
        const gap = target - currentPct;
        const adjusted = baseWeight + adjustFactor * gap;
        const floor = baseWeight * minFloorRatio;
        const weight = Math.max(adjusted, floor);
        return { cat, weight };
    });

    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0) || 1;

    weights.forEach(({ cat, weight }) => {
        const allocation = (weight / totalWeight) * totalMonthly;
        categoryTargets[cat] = {
            ...(categoryTargets[cat] || {}),
            monthly: Number.isFinite(allocation) ? Math.round(allocation) : 0
        };
    });

    saveTargets();
    updateTargetsTable();
}

function totalMonthlyAllocationForTarget(target, sumTargets, budget) {
    if (!budget || !sumTargets) return 0;
    const ratio = Math.max(target, 0) / sumTargets;
    return ratio * budget;
}

function updateTopAssetsTable() {
    const tbody = document.getElementById('topAssetsBody');
    if (!tbody) return;

    const latestSnapshot = snapshots[snapshots.length - 1];

    if (!latestSnapshot) {
        tbody.innerHTML = '';
        return;
    }

    if (selectedCategory) {
        const assetsToShow = latestSnapshot.assets.filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
        const sortedAssets = [...assetsToShow]
            .sort((a, b) => b[AssetIndex.CURRENT_VALUE] - a[AssetIndex.CURRENT_VALUE])
            .slice(0, 5);

        tbody.innerHTML = sortedAssets.map(asset => {
            const name = asset[AssetIndex.NAME];
            const currentValue = asset[AssetIndex.CURRENT_VALUE];
            const purchaseValue = asset[AssetIndex.PURCHASE_VALUE];
            const roi = purchaseValue > 0 ? ((currentValue - purchaseValue) / purchaseValue) * 100 : 0;
            const roiClass = roi >= 0 ? 'positive' : 'negative';

            return `
                <tr>
                    <td><strong>${name.length > 25 ? name.substring(0, 22) + '...' : name}</strong></td>
                    <td>${formatCurrency(currentValue)}</td>
                    <td>${formatCurrency(purchaseValue)}</td>
                    <td class="${roiClass}">${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%</td>
                </tr>
            `;
        }).join('');
    } else {
        const categories = Object.keys(latestSnapshot.categoryTotals);
        const categoryData = categories.map(cat => {
            const catAssets = latestSnapshot.assets.filter(a => a[AssetIndex.CATEGORY] === cat);
            const value = catAssets.reduce((sum, a) => sum + a[AssetIndex.CURRENT_VALUE], 0);
            const invested = catAssets.reduce((sum, a) => sum + a[AssetIndex.PURCHASE_VALUE], 0);
            const roi = invested > 0 ? ((value - invested) / invested) * 100 : 0;
            return { cat, value, invested, roi };
        }).sort((a, b) => b.value - a.value).slice(0, 5);

        tbody.innerHTML = categoryData.map(({ cat, value, invested, roi }) => {
            const roiClass = roi >= 0 ? 'positive' : 'negative';
            const catClass = cat.replace(/\s+/g, '');
            return `
                <tr>
                    <td><span class="category-badge category-${catClass}">${cat}</span></td>
                    <td>${formatCurrency(value)}</td>
                    <td>${formatCurrency(invested)}</td>
                    <td class="${roiClass}">${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%</td>
                </tr>
            `;
        }).join('');
    }
}

function updateSummary() {
    const latestSnapshot = snapshots[snapshots.length - 1];
    const previousSnapshot = getPreviousMonthSnapshot(latestSnapshot);
    const firstSnapshot = snapshots[0];

    if (latestSnapshot) {
        let totalValue, totalPurchase, variation, prevValue, prevInvested;

        if (selectedCategory) {
            const categoryAssets = latestSnapshot.assets.filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
            totalValue = categoryAssets.reduce((sum, a) => sum + a[AssetIndex.CURRENT_VALUE], 0);
            totalPurchase = categoryAssets.reduce((sum, a) => sum + a[AssetIndex.PURCHASE_VALUE], 0);
            variation = totalValue - totalPurchase;

            if (previousSnapshot) {
                const prevAssets = previousSnapshot.assets.filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
                prevValue = prevAssets.reduce((sum, a) => sum + a[AssetIndex.CURRENT_VALUE], 0);
                prevInvested = prevAssets.reduce((sum, a) => sum + a[AssetIndex.PURCHASE_VALUE], 0);
            }
        } else {
            totalValue = latestSnapshot.totalCurrentValue;
            totalPurchase = latestSnapshot.totalPurchaseValue;
            variation = totalValue - totalPurchase;
            prevValue = previousSnapshot ? previousSnapshot.totalCurrentValue : null;
            prevInvested = previousSnapshot ? previousSnapshot.totalPurchaseValue : null;
        }

        document.getElementById('totalValue').textContent = formatCurrency(totalValue);
        document.getElementById('totalInvested').textContent = formatCurrency(totalPurchase);

        let roi = totalPurchase > 0 ? (variation / totalPurchase) * 100 : 0;
        let periodGain = variation;
        if (previousSnapshot && prevValue !== null && prevValue !== undefined) {
            const newInvestment = (totalPurchase - (prevInvested || 0));
            periodGain = totalValue - prevValue - newInvestment;
            roi = prevValue > 0 ? (periodGain / prevValue) * 100 : 0;
        }
        const roiEl = document.getElementById('totalROI');
        roiEl.textContent = (roi >= 0 ? '+' : '') + roi.toFixed(2) + '%';
        roiEl.className = 'metric-value ' + (roi >= 0 ? 'positive' : 'negative');

        const variationEl = document.getElementById('totalVariation');
        variationEl.textContent = (periodGain >= 0 ? '+' : '') + formatCurrency(periodGain);
        variationEl.className = 'metric-value ' + (periodGain >= 0 ? 'positive' : 'negative');

        const accumRoi = totalPurchase > 0 ? ((totalValue - totalPurchase) / totalPurchase) * 100 : 0;
        const totalRoiAccumEl = document.getElementById('totalRoiAccum');
        if (totalRoiAccumEl) {
            totalRoiAccumEl.textContent = (accumRoi >= 0 ? '+' : '') + accumRoi.toFixed(2) + '%';
            totalRoiAccumEl.className = 'metric-value ' + (accumRoi >= 0 ? 'positive' : 'negative');
        }

        const lastMonthInvestedEl = document.getElementById('lastMonthInvested');
        if (lastMonthInvestedEl) {
            if (previousSnapshot && prevInvested !== null && prevInvested !== undefined) {
                const lastInvestment = totalPurchase - prevInvested;
                const arrow = lastInvestment >= 0 ? '↑' : '↓';
                lastMonthInvestedEl.textContent = `${arrow} ${formatCurrency(Math.abs(lastInvestment))}`;
                lastMonthInvestedEl.className = 'metric-change ' + (lastInvestment >= 0 ? 'positive' : 'negative');
            } else {
                lastMonthInvestedEl.textContent = '';
                lastMonthInvestedEl.className = 'metric-change';
            }
        }

        const changeIndicator = document.getElementById('valueChangeIndicator');
        const currentProfit = totalValue - totalPurchase;
        if (changeIndicator && firstSnapshot) {
            changeIndicator.textContent = `${currentProfit >= 0 ? '↑' : '↓'} ${formatCurrency(Math.abs(currentProfit))}`;
            changeIndicator.className = 'change-indicator ' + (currentProfit >= 0 ? 'positive' : 'negative');
        } else if (document.getElementById('valueChangeIndicator')) {
            document.getElementById('valueChangeIndicator').textContent = '';
        }

        const getSnapshotTotals = (snapshot) => {
            if (!snapshot) return null;
            if (selectedCategory) {
                const assets = snapshot.assets.filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
                const value = assets.reduce((sum, a) => sum + a[AssetIndex.CURRENT_VALUE], 0);
                const invested = assets.reduce((sum, a) => sum + a[AssetIndex.PURCHASE_VALUE], 0);
                return { value, invested };
            }
            return { value: snapshot.totalCurrentValue, invested: snapshot.totalPurchaseValue };
        };

        const compareStartEl = document.getElementById('compareStart');
        const compareMonthEl = document.getElementById('compareMonth');
        const compareYearEl = document.getElementById('compareYear');

        const setComparison = (el, snapshot) => {
            if (!el) return;
            const totals = getSnapshotTotals(snapshot);
            if (!totals) {
                el.textContent = '—';
                el.className = 'comparison-value';
                return;
            }
            const profit = totals.value - totals.invested;
            const change = currentProfit - profit;
            el.textContent = `${change >= 0 ? '+' : '-'}${formatCurrency(Math.abs(change))}`;
            el.className = 'comparison-value ' + (change >= 0 ? 'positive' : 'negative');
        };

        setComparison(compareStartEl, getYearStartSnapshot(latestSnapshot));
        setComparison(compareMonthEl, previousSnapshot);
        setComparison(compareYearEl, getSnapshotMonthsAgo(latestSnapshot, 12));
    } else {
        document.getElementById('totalValue').textContent = '0,00 €';
        document.getElementById('totalInvested').textContent = '0,00 €';
        document.getElementById('totalROI').textContent = '0,00%';
        document.getElementById('totalVariation').textContent = '0,00 €';
        const totalRoiAccumEl = document.getElementById('totalRoiAccum');
        if (totalRoiAccumEl) totalRoiAccumEl.textContent = '0,00%';
        const lastMonthInvestedEl = document.getElementById('lastMonthInvested');
        if (lastMonthInvestedEl) {
            lastMonthInvestedEl.textContent = '— vs mes anterior';
            lastMonthInvestedEl.className = 'metric-change';
        }
        const compareStartEl = document.getElementById('compareStart');
        const compareMonthEl = document.getElementById('compareMonth');
        const compareYearEl = document.getElementById('compareYear');
        if (compareStartEl) compareStartEl.textContent = '—';
        if (compareMonthEl) compareMonthEl.textContent = '—';
        if (compareYearEl) compareYearEl.textContent = '—';
    }

}

function updateHistoryTable() {
    const tbody = document.getElementById('historyBody');
    const emptyState = document.getElementById('emptyState');

    if (snapshots.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    tbody.innerHTML = snapshots.slice().reverse().map(snapshot => {
        const date = new Date(snapshot.date);
        const formattedDate = date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const variationClass = snapshot.variation >= 0 ? 'positive' : 'negative';
        const variationSign = snapshot.variation >= 0 ? '+' : '';

        const tag = snapshot.tag ? `<span class="history-tag">${snapshot.tag}</span>` : '';
        const note = snapshot.note ? `<span class="history-note">${snapshot.note}</span>` : '';
        const meta = tag || note ? `<div class="history-meta">${tag}${note}</div>` : '<span class="history-empty">—</span>';

        return `
            <tr>
                <td>${formattedDate}</td>
                <td>${formatCurrency(snapshot.totalCurrentValue)}</td>
                <td class="${variationClass}">${variationSign}${formatCurrency(snapshot.variation)}</td>
                <td>${snapshot.assets.length}</td>
                <td>${meta}</td>
                <td>
                    <button class="action-btn" data-action="view" data-id="${snapshot.id}">👁️</button>
                    <button class="action-btn" data-action="copy" data-id="${snapshot.id}" title="Copiar snapshot">⎘</button>
                    <button class="action-btn" data-action="edit" data-id="${snapshot.id}">✏️</button>
                    <button class="action-btn delete" data-action="delete" data-id="${snapshot.id}">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');
}

function viewSnapshot(id) {
    const snapshot = snapshots.find(s => s.id === id);
    if (!snapshot) return;

    const section = document.getElementById('assetsSection');
    section.style.display = 'block';

    const date = new Date(snapshot.date);
    const dateLabel = date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const metaParts = [];
    if (snapshot.tag) metaParts.push(snapshot.tag);
    if (snapshot.note) metaParts.push(snapshot.note);
    document.getElementById('assetsDate').textContent = metaParts.length
        ? `${dateLabel} · ${metaParts.join(' · ')}`
        : dateLabel;

    const tbody = document.getElementById('assetsBody');
    tbody.innerHTML = snapshot.assets.map(asset => {
        const name = asset[AssetIndex.NAME];
        const term = asset[AssetIndex.TERM];
        const category = asset[AssetIndex.CATEGORY];
        const purchasePrice = asset[AssetIndex.PURCHASE_PRICE];
        const quantity = asset[AssetIndex.QUANTITY];
        const currentPrice = asset[AssetIndex.CURRENT_PRICE];
        const purchaseValue = asset[AssetIndex.PURCHASE_VALUE];
        const currentValue = asset[AssetIndex.CURRENT_VALUE];

        const variation = currentValue - purchaseValue;
        const variationClass = variation >= 0 ? 'positive' : 'negative';
        const variationSign = variation >= 0 ? '+' : '';
        const categoryClass = category.replace(/\s+/g, '');

        return `
            <tr>
                <td><strong>${name}</strong></td>
                <td><span class="term-badge term-${term}">${term}</span></td>
                <td><span class="category-badge category-${categoryClass}">${category}</span></td>
                <td>${formatCurrency(purchasePrice)}</td>
                <td>${quantity.toLocaleString('es-ES', { minimumFractionDigits: 3 })}</td>
                <td>${formatCurrency(currentPrice)}</td>
                <td>${formatCurrency(purchaseValue)}</td>
                <td>${formatCurrency(currentValue)}</td>
                <td class="${variationClass}">${variationSign}${formatCurrency(variation)}</td>
            </tr>
        `;
    }).join('');

    section.scrollIntoView({ behavior: 'smooth' });
}

function deleteSnapshot(id) {
    showModal('¿Estás seguro de que quieres eliminar este snapshot?', () => {
        snapshots = snapshots.filter(s => s.id !== id);
        saveSnapshots();
        updateUI();
        document.getElementById('assetsSection').style.display = 'none';
        showToast('Snapshot eliminado', 'success');
    });
}

function initCharts() {
    const evolutionCtx = document.getElementById('evolutionChart').getContext('2d');
    evolutionChart = new Chart(evolutionCtx, {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: getLineChartOptions()
    });

    const roiCtx = document.getElementById('roiEvolutionChart').getContext('2d');
    roiEvolutionChart = new Chart(roiCtx, {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: getRoiChartOptions()
    });

    const categoryCtx = document.getElementById('categoryChart').getContext('2d');
    categoryChart = new Chart(categoryCtx, {
        type: 'doughnut',
        data: { labels: [], datasets: [] },
        options: getDoughnutOptions()
    });

    const termCtx = document.getElementById('termChart').getContext('2d');
    termChart = new Chart(termCtx, {
        type: 'doughnut',
        data: { labels: [], datasets: [] },
        options: getDoughnutOptions()
    });

    const targetsCtx = document.getElementById('targetsChart')?.getContext('2d');
    if (targetsCtx) {
        targetsChart = new Chart(targetsCtx, {
            type: 'bar',
            data: { labels: [], datasets: [] },
            options: getTargetsChartOptions()
        });
    }
}

function getLineChartOptions() {
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

function getDoughnutOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'right',
                labels: {
                    color: '#a1a1a6',
                    font: { family: '-apple-system, BlinkMacSystemFont, sans-serif', size: 11 },
                    usePointStyle: true,
                    padding: 12
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
        cutout: '55%'
    };
}

function getTargetsChartOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
            legend: {
                display: true,
                position: 'top',
                labels: {
                    color: '#a1a1a6',
                    font: { family: '-apple-system, BlinkMacSystemFont, sans-serif', size: 11 },
                    usePointStyle: true,
                    padding: 12
                }
            },
            tooltip: {
                backgroundColor: 'rgba(45, 45, 47, 0.95)',
                titleColor: '#f5f5f7',
                bodyColor: '#a1a1a6',
                borderColor: 'rgba(255, 255, 255, 0.12)',
                borderWidth: 1,
                padding: 10,
                cornerRadius: 10,
                callbacks: {
                    label: function (context) {
                        const value = context.parsed.x;
                        return `${context.dataset.label}: ${value.toFixed(1)}%`;
                    }
                }
            },
            datalabels: { display: false }
        },
        scales: {
            x: {
                min: 0,
                max: 100,
                grid: { color: 'rgba(255, 255, 255, 0.04)' },
                ticks: {
                    color: '#6e6e73',
                    font: { size: 11 },
                    callback: value => `${value}%`
                }
            },
            y: {
                grid: { display: false },
                ticks: { color: '#6e6e73', font: { size: 11 } }
            }
        }
    };
}

function getRoiChartOptions() {
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

function getMonthlySnapshots() {
    const map = new Map();
    snapshots.forEach(s => {
        const d = new Date(s.date);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        map.set(key, s);
    });
    return Array.from(map.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
}

function getSnapshotsForRange() {
    if (snapshots.length === 0) return [];
    if (currentRange === 'all') return snapshots;

    const latest = snapshots[snapshots.length - 1];
    const endDate = new Date(latest.date);
    const startDate = new Date(endDate);

    if (currentRange === '6m') startDate.setMonth(startDate.getMonth() - 6);
    if (currentRange === '1y') startDate.setMonth(startDate.getMonth() - 12);
    if (currentRange === '3y') startDate.setMonth(startDate.getMonth() - 36);

    startDate.setHours(0, 0, 0, 0);

    return snapshots.filter(s => new Date(s.date) >= startDate);
}

function getMonthlySnapshotsForRange() {
    const rangeSnapshots = getSnapshotsForRange();
    const map = new Map();
    rangeSnapshots.forEach(s => {
        const d = new Date(s.date);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        map.set(key, s);
    });
    return Array.from(map.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
}

function calculateAnnualizedRoi(value, invested, startDate, currentDate) {
    if (invested <= 0) return 0;
    const ratio = value / invested;
    if (ratio <= 0) return 0;
    const years = (currentDate - startDate) / (365.25 * 24 * 60 * 60 * 1000);
    if (years <= 0) return 0;
    return (Math.pow(ratio, 1 / years) - 1) * 100;
}

function updateEvolutionChart() {
    if (!evolutionChart) return;

    const snapshotData = getSnapshotsForRange();

    if (snapshotData.length === 0) {
        evolutionChart.data.labels = [];
        evolutionChart.data.datasets = [];
        evolutionChart.update();
        return;
    }

    let datasets = [];

    if (currentChartMode === 'total') {
        let valueData, investedData, labelValue, labelInvested;

        if (selectedCategory) {
            valueData = snapshotData.map(s => {
                const catAssets = s.assets.filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
                const total = catAssets.reduce((sum, a) => sum + a[AssetIndex.CURRENT_VALUE], 0);
                return { x: new Date(s.date), y: total };
            });
            investedData = snapshotData.map(s => {
                const catAssets = s.assets.filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
                const total = catAssets.reduce((sum, a) => sum + a[AssetIndex.PURCHASE_VALUE], 0);
                return { x: new Date(s.date), y: total };
            });
            labelValue = selectedCategory;
            labelInvested = 'Invertido';
        } else {
            valueData = snapshotData.map(s => ({ x: new Date(s.date), y: s.totalCurrentValue }));
            investedData = snapshotData.map(s => ({ x: new Date(s.date), y: s.totalPurchaseValue }));
            labelValue = 'Valor Total';
            labelInvested = 'Total Invertido';
        }

        datasets = [
            {
                label: labelValue,
                data: valueData,
                borderColor: '#0071e3',
                backgroundColor: 'rgba(0, 113, 227, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 3,
                pointHitRadius: 6,
                pointBackgroundColor: '#0071e3'
            },
            {
                label: labelInvested,
                data: investedData,
                borderColor: '#86868b',
                borderDash: [5, 5],
                backgroundColor: 'transparent',
                fill: false,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 3,
                pointHitRadius: 6,
                pointBackgroundColor: '#86868b'
            }
        ];
        evolutionChart.options.scales.y.stacked = false;
    } else if (currentChartMode === 'category') {
        const latestSnapshot = snapshotData[snapshotData.length - 1];

        if (selectedCategory) {
            const categoryAssets = latestSnapshot.assets.filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
            const topAssets = categoryAssets
                .sort((a, b) => b[AssetIndex.CURRENT_VALUE] - a[AssetIndex.CURRENT_VALUE])
                .slice(0, 5);

            const colors = ['#0071e3', '#32d74b', '#ff9f0a', '#bf5af2', '#ff375f'];
            datasets = topAssets.map((asset, i) => {
                const assetName = asset[AssetIndex.NAME];
                const data = snapshotData.map(s => {
                    const found = s.assets.find(a => a[AssetIndex.NAME] === assetName);
                    return { x: new Date(s.date), y: found ? found[AssetIndex.CURRENT_VALUE] : 0 };
                });

                return {
                    label: assetName.length > 20 ? assetName.substring(0, 17) + '...' : assetName,
                    data: data,
                    borderColor: colors[i],
                    backgroundColor: colors[i] + '60',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                };
            });
        } else {
            const sortedCategories = Object.entries(latestSnapshot.categoryTotals)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([cat]) => cat);

            sortedCategories.forEach(cat => {
                datasets.push({
                    label: cat,
                    data: snapshotData.map(s => ({ x: new Date(s.date), y: s.categoryTotals[cat] || 0 })),
                    borderColor: categoryColors[cat] || '#888',
                    backgroundColor: (categoryColors[cat] || '#888') + '60',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                });
            });
        }
        evolutionChart.options.scales.y.stacked = true;
    }

    evolutionChart.data.labels = [];
    evolutionChart.data.datasets = datasets;

    const allValues = datasets.flatMap(ds => (ds.data || []).map(point => point.y));

    if (evolutionScaleMode === 'logarithmic') {
        const positiveValues = allValues.filter(v => v > 0);
        const minPositive = positiveValues.length ? Math.min(...positiveValues) : 1;

        evolutionChart.options.scales.y.type = 'logarithmic';
        evolutionChart.options.scales.y.min = minPositive * 0.8;
        evolutionChart.options.scales.y.beginAtZero = false;
    } else {
        evolutionChart.options.scales.y.type = 'linear';
        if (evolutionMinMode === 'min' && allValues.length) {
            const minValue = Math.min(...allValues);
            const padding = Math.abs(minValue) * 0.05;
            evolutionChart.options.scales.y.min = minValue - padding;
            evolutionChart.options.scales.y.beginAtZero = false;
        } else {
            evolutionChart.options.scales.y.min = undefined;
            evolutionChart.options.scales.y.beginAtZero = true;
        }
    }
    evolutionChart.update();

    updateRoiEvolutionChart(snapshotData);
}

function updateRoiEvolutionChart(snapshotData) {
    if (!roiEvolutionChart) return;

    if (!snapshotData) snapshotData = getSnapshotsForRange();
    const monthlyData = getMonthlySnapshotsForRange();

    if (snapshotData.length === 0) {
        roiEvolutionChart.data.labels = [];
        roiEvolutionChart.data.datasets = [];
        roiEvolutionChart.update();
        return;
    }

    const getValues = (snapshot) => {
        if (selectedCategory) {
            const catAssets = snapshot.assets.filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
            const value = catAssets.reduce((sum, a) => sum + a[AssetIndex.CURRENT_VALUE], 0);
            const invested = catAssets.reduce((sum, a) => sum + a[AssetIndex.PURCHASE_VALUE], 0);
            return { value, invested };
        }
        return { value: snapshot.totalCurrentValue, invested: snapshot.totalPurchaseValue };
    };

    let datasets = [];

    if (currentRoiMode === 'cumulative') {
        const roiPercent = snapshotData.map(s => {
            const { value, invested } = getValues(s);
            const roi = invested > 0 ? ((value - invested) / invested) * 100 : 0;
            return { x: new Date(s.date), y: roi };
        });

        const roiAbsolute = snapshotData.map(s => {
            const { value, invested } = getValues(s);
            return { x: new Date(s.date), y: value - invested };
        });

        datasets = [
            {
                label: 'ROI %',
                data: roiPercent,
                borderColor: '#0071e3',
                backgroundColor: 'rgba(0, 113, 227, 0.15)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 3,
                pointHitRadius: 6,
                pointBackgroundColor: roiPercent.map(p => p.y >= 0 ? '#32d74b' : '#ff453a'),
                yAxisID: 'y'
            },
            {
                label: 'Ganancia €',
                data: roiAbsolute,
                borderColor: '#bf5af2',
                borderDash: [5, 5],
                backgroundColor: 'transparent',
                fill: false,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 3,
                pointHitRadius: 6,
                yAxisID: 'y1'
            }
        ];

        roiEvolutionChart.options.scales.y1 = {
            position: 'right',
            grid: { display: false },
            ticks: {
                color: '#6e6e73',
                font: { size: 11 },
                callback: value => formatCurrency(value)
            },
            beginAtZero: true
        };
    } else if (currentRoiMode === 'annualized') {
        const startDate = new Date(snapshotData[0].date);

        const annualizedRoiPercent = snapshotData.map(s => {
            const { value, invested } = getValues(s);
            const roi = calculateAnnualizedRoi(value, invested, startDate, new Date(s.date));
            return { x: new Date(s.date), y: roi };
        });

        datasets = [
            {
                label: 'ROI anualizado %',
                data: annualizedRoiPercent,
                borderColor: '#0071e3',
                backgroundColor: 'rgba(0, 113, 227, 0.15)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 3,
                pointHitRadius: 6,
                pointBackgroundColor: annualizedRoiPercent.map(p => p.y >= 0 ? '#32d74b' : '#ff453a'),
                yAxisID: 'y'
            }
        ];

        delete roiEvolutionChart.options.scales.y1;
    } else {
        const periodSource = monthlyData.length ? monthlyData : snapshotData;

        const periodRoiPercent = periodSource.map((s, i) => {
            const { value, invested } = getValues(s);
            if (i === 0) {
                const roi = invested > 0 ? ((value - invested) / invested) * 100 : 0;
                return { x: new Date(s.date), y: roi };
            }
            const prev = periodSource[i - 1];
            const { value: prevValue, invested: prevInvested } = getValues(prev);
            const newInvestment = invested - prevInvested;
            const actualGain = value - prevValue - newInvestment;
            const roi = prevValue > 0 ? (actualGain / prevValue) * 100 : 0;
            return { x: new Date(s.date), y: roi };
        });

        const periodRoiAbsolute = periodSource.map((s, i) => {
            const { value, invested } = getValues(s);
            if (i === 0) {
                return { x: new Date(s.date), y: value - invested };
            }
            const prev = periodSource[i - 1];
            const { value: prevValue, invested: prevInvested } = getValues(prev);
            const newInvestment = invested - prevInvested;
            return { x: new Date(s.date), y: value - prevValue - newInvestment };
        });

        datasets = [
            {
                label: 'Variación %',
                data: periodRoiPercent,
                borderColor: '#0071e3',
                backgroundColor: periodRoiPercent.map(p => p.y >= 0 ? 'rgba(50, 215, 75, 0.3)' : 'rgba(255, 69, 58, 0.3)'),
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 3,
                pointHitRadius: 6,
                pointBackgroundColor: periodRoiPercent.map(p => p.y >= 0 ? '#32d74b' : '#ff453a'),
                yAxisID: 'y'
            },
            {
                label: 'Variación €',
                data: periodRoiAbsolute,
                borderColor: '#bf5af2',
                borderDash: [5, 5],
                backgroundColor: 'transparent',
                fill: false,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 3,
                pointHitRadius: 6,
                yAxisID: 'y1'
            }
        ];

        roiEvolutionChart.options.scales.y1 = {
            position: 'right',
            grid: { display: false },
            ticks: {
                color: '#6e6e73',
                font: { size: 11 },
                callback: value => formatCurrency(value)
            },
            beginAtZero: true
        };
    }

    roiEvolutionChart.data = { labels: [], datasets };
    roiEvolutionChart.update();
}

function updateDistributionCharts() {
    if (!categoryChart || !termChart) return;

    if (snapshots.length === 0) {
        categoryChart.data = { labels: [], datasets: [] };
        termChart.data = { labels: [], datasets: [] };
        categoryChart.update();
        termChart.update();
        return;
    }

    const latestSnapshot = snapshots[snapshots.length - 1];

    if (selectedCategory) {
        const categoryAssets = latestSnapshot.assets.filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
        const assetLabels = categoryAssets.map(a => a[AssetIndex.NAME].length > 15 ? a[AssetIndex.NAME].substring(0, 12) + '...' : a[AssetIndex.NAME]);
        const assetData = categoryAssets.map(a => a[AssetIndex.CURRENT_VALUE]);
        const assetColors = ['#0071e3', '#32d74b', '#ff9f0a', '#bf5af2', '#ff375f', '#64d2ff', '#30d158', '#ff453a'];
        const totalValue = assetData.reduce((sum, v) => sum + v, 0) || 0;
        const assetTargets = categoryTargets[selectedCategory]?.assets || {};
        const targetData = categoryAssets.map(a => {
            const targetPct = assetTargets[a[AssetIndex.NAME]]?.target ?? 0;
            return totalValue > 0 ? (totalValue * targetPct) / 100 : 0;
        });

        categoryChart.data = {
            labels: assetLabels,
            datasets: [
                {
                    data: assetData,
                    backgroundColor: assetColors.slice(0, assetData.length),
                    borderColor: 'transparent',
                    hoverOffset: 10,
                    weight: 1
                },
                {
                    data: targetData,
                    backgroundColor: assetColors.slice(0, assetData.length).map(color => `${color}2A`),
                    borderColor: assetColors.slice(0, assetData.length),
                    borderWidth: 2,
                    hoverOffset: 0,
                    weight: 0.5
                }
            ]
        };

        categoryChart.options.onClick = null;
    } else {
        const categoryLabels = Object.keys(latestSnapshot.categoryTotals);
        const categoryData = Object.values(latestSnapshot.categoryTotals);
        const catColors = categoryLabels.map(cat => (categoryColors && categoryColors[cat]) || '#888');
        const totalValue = categoryData.reduce((sum, v) => sum + v, 0) || 0;
        const targetData = categoryLabels.map(cat => {
            const targetPct = categoryTargets[cat]?.target ?? 0;
            return totalValue > 0 ? (totalValue * targetPct) / 100 : 0;
        });

        categoryChart.data = {
            labels: categoryLabels,
            datasets: [
                {
                    data: categoryData,
                    backgroundColor: catColors,
                    borderColor: 'transparent',
                    hoverOffset: 10,
                    weight: 1
                },
                {
                    data: targetData,
                    backgroundColor: catColors.map(color => `${color}2A`),
                    borderColor: catColors,
                    borderWidth: 2,
                    hoverOffset: 0,
                    weight: 0.5
                }
            ]
        };

        categoryChart.options.onClick = (evt, elements) => {
            if (elements.length > 0) {
                const index = elements[0].index;
                const category = categoryLabels[index];
                selectCategory(category);
            }
        };
    }
    categoryChart.update();

    const termLabels = Object.keys(latestSnapshot.termTotals);
    const termData = Object.values(latestSnapshot.termTotals);
    const tColors = termLabels.map(term => termColors[term] || '#888');

    termChart.data = {
        labels: termLabels,
        datasets: [{
            data: termData,
            backgroundColor: tColors,
            borderColor: 'transparent',
            hoverOffset: 10
        }]
    };
    termChart.update();
}

function getPreviousMonthSnapshot(currentSnapshot) {
    if (!currentSnapshot) return null;
    const curDate = new Date(currentSnapshot.date);
    const curMonth = curDate.getMonth();
    const curYear = curDate.getFullYear();

    // Buscar el último snapshot que sea de un mes anterior al actual
    for (let i = snapshots.length - 2; i >= 0; i--) {
        const s = snapshots[i];
        const d = new Date(s.date);
        if (d.getFullYear() < curYear || (d.getFullYear() === curYear && d.getMonth() < curMonth)) {
            return s;
        }
    }
    return null;
}

function getSnapshotMonthsAgo(currentSnapshot, monthsBack) {
    if (!currentSnapshot) return null;
    const curDate = new Date(currentSnapshot.date);
    const targetDate = new Date(curDate.getFullYear(), curDate.getMonth() - monthsBack + 1, 0);
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth();

    for (let i = snapshots.length - 2; i >= 0; i--) {
        const s = snapshots[i];
        const d = new Date(s.date);
        if (d.getFullYear() < targetYear || (d.getFullYear() === targetYear && d.getMonth() <= targetMonth)) {
            return s;
        }
    }
    return null;
}

function getYearStartSnapshot(currentSnapshot) {
    if (!currentSnapshot) return null;
    const curDate = new Date(currentSnapshot.date);
    const startDate = new Date(curDate.getFullYear(), 0, 1);
    for (let i = 0; i < snapshots.length; i++) {
        const s = snapshots[i];
        const d = new Date(s.date);
        if (d >= startDate) return s;
    }
    return null;
}

function updateCompositionList() {
    const container = document.getElementById('compositionList');
    const title = document.getElementById('diversificationTitle');
    if (!container || snapshots.length === 0) return;

    const latestSnapshot = snapshots[snapshots.length - 1];
    const prevSnapshot = getSnapshotMonthsAgo(latestSnapshot, compositionCompareMonths);
    const colors = ['#0071e3', '#32d74b', '#ff9f0a', '#bf5af2', '#ff375f', '#64d2ff', '#30d158', '#ff453a', '#5e5ce6', '#ac8e68'];

    const normalizeKey = (value) => (value || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');

    let items = [];

    if (selectedCategory) {
        title.textContent = 'Composición de ' + selectedCategory;
        const catAssets = latestSnapshot.assets.filter(a => a[AssetIndex.CATEGORY] === selectedCategory);
        const catTotal = catAssets.reduce((sum, a) => sum + a[AssetIndex.CURRENT_VALUE], 0) || 1;

        let prevCatTotal = catTotal;
        const prevAssetMap = new Map();
        if (prevSnapshot) {
            const prevCatAssets = prevSnapshot.assets.filter(a => normalizeKey(a[AssetIndex.CATEGORY]) === normalizeKey(selectedCategory));
            prevCatTotal = prevCatAssets.reduce((sum, a) => sum + a[AssetIndex.CURRENT_VALUE], 0) || 1;
            prevCatAssets.forEach(a => {
                const key = normalizeKey(a[AssetIndex.NAME]);
                if (!prevAssetMap.has(key)) {
                    prevAssetMap.set(key, a);
                }
            });
        }

        catAssets.sort((a, b) => b[AssetIndex.CURRENT_VALUE] - a[AssetIndex.CURRENT_VALUE]);

        items = catAssets.slice(0, 8).map((asset, i) => {
            const percent = (asset[AssetIndex.CURRENT_VALUE] / catTotal) * 100;
            let prevPercent = 0;
            if (prevSnapshot) {
                const prevAsset = prevAssetMap.get(normalizeKey(asset[AssetIndex.NAME]));
                if (prevAsset) {
                    prevPercent = (prevAsset[AssetIndex.CURRENT_VALUE] / prevCatTotal) * 100;
                }
            }
            const change = prevSnapshot ? percent - prevPercent : 0;
            return {
                label: asset[AssetIndex.NAME].length > 18 ? asset[AssetIndex.NAME].substring(0, 15) + '...' : asset[AssetIndex.NAME],
                percent,
                prevPercent,
                change,
                color: colors[i % colors.length]
            };
        });
    } else {
        title.textContent = 'Composición del Portfolio';
        const total = latestSnapshot.totalCurrentValue || 1;
        const prevTotal = prevSnapshot ? prevSnapshot.totalCurrentValue || 1 : total;

        const categories = Object.keys(latestSnapshot.categoryTotals).sort((a, b) =>
            (latestSnapshot.categoryTotals[b] || 0) - (latestSnapshot.categoryTotals[a] || 0)
        );

        items = categories.map(cat => {
            const percent = ((latestSnapshot.categoryTotals[cat] || 0) / total) * 100;
            let prevPercent = 0;
            if (prevSnapshot && prevSnapshot.categoryTotals) {
                prevPercent = ((prevSnapshot.categoryTotals[cat] || 0) / prevTotal) * 100;
            }
            const change = prevSnapshot ? percent - prevPercent : 0;
            return {
                label: cat,
                percent,
                prevPercent,
                change,
                color: categoryColors && categoryColors[cat] ? categoryColors[cat] : '#888'
            };
        });
    }

    const hasChange = items.some(item => Math.abs(item.change) > 0.01);

    container.innerHTML = items.map(item => {
        const changeClass = item.change > 0.05 ? 'positive' : item.change < -0.05 ? 'negative' : 'neutral';
        const arrow = item.change > 0.05 ? '↑' : item.change < -0.05 ? '↓' : '';
        const changeText = !hasChange ? '—' : (Math.abs(item.change) < 0.05 ? '=' : `${item.change > 0 ? '+' : ''}${item.change.toFixed(1)}%`);

        return `
            <div class="composition-item">
                <span class="composition-label">${item.label}</span>
                <div class="composition-bar-wrapper">
                    <div class="composition-bar composition-bar-previous" style="width: ${item.prevPercent ? Math.max(item.prevPercent, 2) : 0}%; background: ${item.color};"></div>
                    <div class="composition-bar composition-bar-current" style="width: ${Math.max(item.percent, 2)}%; background: ${item.color};">
                        <span class="composition-percent">${item.percent.toFixed(1)}%</span>
                    </div>
                    ${item.prevPercent ? `<span class="composition-bar-marker" style="left: ${Math.min(item.prevPercent, 100)}%"></span>` : ''}
                </div>
                <span class="composition-change ${changeClass}">${arrow} ${changeText}</span>
            </div>
        `;
    }).join('');
}

function showModal(message, onConfirm) {
    const modal = document.getElementById('modal');
    const modalBox = modal.querySelector('.modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalIcon = document.getElementById('modalIcon');
    const cancelBtn = document.getElementById('modalCancel');
    const confirmBtn = document.getElementById('modalConfirm');

    if (modalBox) modalBox.classList.remove('detailed');
    if (modalTitle) modalTitle.textContent = 'Confirmar';
    if (modalIcon) modalIcon.textContent = '✓';
    if (modalMessage) modalMessage.textContent = message;
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    if (confirmBtn) confirmBtn.textContent = 'Confirmar';

    modal.classList.add('show');

    document.getElementById('modalConfirm').onclick = () => {
        hideModal();
        if (onConfirm) onConfirm();
    };
}

function showHoldingsChangesIfAny() {
    const message = localStorage.getItem(HOLDINGS_CHANGES_KEY);
    if (!message) return;
    localStorage.removeItem(HOLDINGS_CHANGES_KEY);
    const modal = document.getElementById('modal');
    const modalBox = modal.querySelector('.modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalIcon = document.getElementById('modalIcon');
    const cancelBtn = document.getElementById('modalCancel');
    const confirmBtn = document.getElementById('modalConfirm');

    if (modalBox) modalBox.classList.add('detailed');
    if (modalTitle) modalTitle.textContent = 'Cambios guardados';
    if (modalIcon) modalIcon.textContent = '✓';
    if (modalMessage) modalMessage.textContent = message;
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (confirmBtn) confirmBtn.textContent = 'Cerrar';

    modal.classList.add('show');
    confirmBtn.onclick = () => hideModal();
}

function hideModal() {
    document.getElementById('modal').classList.remove('show');
}

document.addEventListener('DOMContentLoaded', init);
