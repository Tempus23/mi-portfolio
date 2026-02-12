import { STORAGE_KEYS, AssetIndex } from './js/shared/constants.js';
import { formatCurrency } from './js/shared/format.js';
import { showToast } from './js/shared/toast.js';

const {
    SNAPSHOTS: STORAGE_KEY,
    HOLDINGS_CHANGES: HOLDINGS_CHANGES_KEY
} = STORAGE_KEYS;

let snapshots = [];
let originalAssets = [];
let editedAssets = [];
let baseSnapshotDate = null;
let holdingsProfitabilityMode = 'category';

init();

function init() {
    loadSnapshots();
    loadBaseAssets();
    renderHoldingsTable();
    renderHoldingsProfitability();
    const saveBtn = document.getElementById('saveHoldings');
    if (saveBtn) saveBtn.addEventListener('click', openSaveModal);

    document.querySelectorAll('.segment-holdings-roi').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.segment-holdings-roi').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            holdingsProfitabilityMode = e.target.dataset.mode === 'asset' ? 'asset' : 'category';
            renderHoldingsProfitability();
        });
    });

    const cancelBtn = document.getElementById('saveModalCancel');
    const confirmBtn = document.getElementById('saveModalConfirm');
    if (cancelBtn) cancelBtn.addEventListener('click', hideSaveModal);
    if (confirmBtn) confirmBtn.addEventListener('click', confirmSaveChanges);
}

function loadSnapshots() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
        snapshots = [];
        return;
    }

    let loadedData;
    try {
        loadedData = JSON.parse(stored);
    } catch (error) {
        localStorage.removeItem(STORAGE_KEY);
        snapshots = [];
        showToast('Datos corruptos en almacenamiento local. Se reinició el historial.', 'error');
        return;
    }
    if (!Array.isArray(loadedData)) {
        snapshots = [];
        return;
    }

    snapshots = loadedData.map(s => {
        const assets = (s.assets || []).map(asset => {
            if (Array.isArray(asset)) return asset;
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
        return { id: s.id, date: s.date, assets };
    });
}

function loadBaseAssets() {
    const latestSnapshot = snapshots.at(-1);
    if (!latestSnapshot) return;
    baseSnapshotDate = latestSnapshot.date;
    originalAssets = latestSnapshot.assets.map(a => [...a]);
    editedAssets = latestSnapshot.assets.map(a => [...a]);
}

function renderHoldingsTable() {
    const tbody = document.getElementById('holdingsBody');
    const empty = document.getElementById('holdingsEmpty');
    if (!tbody || !empty) return;

    if (snapshots.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    const latestSnapshot = snapshots.at(-1);
    if (!latestSnapshot) return;

    empty.style.display = 'none';

    tbody.innerHTML = editedAssets.map((asset, index) => {
        const name = asset[AssetIndex.NAME];
        const term = asset[AssetIndex.TERM];
        const category = asset[AssetIndex.CATEGORY];
        const purchasePrice = asset[AssetIndex.PURCHASE_PRICE];
        const quantity = asset[AssetIndex.QUANTITY];
        const currentPrice = asset[AssetIndex.CURRENT_PRICE];

        const purchaseValue = purchasePrice * quantity;
        const currentValue = currentPrice * quantity;
        const roi = purchaseValue > 0 ? ((currentValue - purchaseValue) / purchaseValue) * 100 : 0;
        const roiClass = roi >= 0 ? 'positive' : 'negative';

        return `
            <tr data-index="${index}">
                <td><strong>${name}</strong></td>
                <td>${category}</td>
                <td>${term}</td>
                <td>
                    <input class="table-input qty-input" type="number" min="0" step="0.0001" value="${quantity}">
                </td>
                <td>
                    <input class="table-input buy-price-input" type="number" min="0" step="0.01" value="${purchasePrice}">
                </td>
                <td>
                    <input class="table-input price-input" type="number" min="0" step="0.01" value="${currentPrice}">
                </td>
                <td class="purchase-value">${formatCurrency(purchaseValue)}</td>
                <td class="current-value">${formatCurrency(currentValue)}</td>
                <td class="roi-value ${roiClass}">${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%</td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.qty-input, .price-input, .buy-price-input').forEach(input => {
        input.addEventListener('input', handleRowUpdate);
    });
}

function handleRowUpdate(e) {
    const row = e.target.closest('tr');
    if (!row) return;

    const index = Number.parseInt(row.dataset.index, 10);
    const asset = editedAssets[index];
    if (!asset) return;

    const qtyInput = row.querySelector('.qty-input');
    const priceInput = row.querySelector('.price-input');
    const buyPriceInput = row.querySelector('.buy-price-input');

    const quantity = Number.parseFloat(qtyInput.value) || 0;
    const currentPrice = Number.parseFloat(priceInput.value) || 0;
    const purchasePrice = Number.parseFloat(buyPriceInput.value) || 0;

    const purchaseValue = purchasePrice * quantity;
    const currentValue = currentPrice * quantity;
    const roi = purchaseValue > 0 ? ((currentValue - purchaseValue) / purchaseValue) * 100 : 0;

    asset[AssetIndex.QUANTITY] = quantity;
    asset[AssetIndex.PURCHASE_PRICE] = purchasePrice;
    asset[AssetIndex.CURRENT_PRICE] = currentPrice;
    asset[AssetIndex.PURCHASE_VALUE] = purchaseValue;
    asset[AssetIndex.CURRENT_VALUE] = currentValue;

    row.querySelector('.purchase-value').textContent = formatCurrency(purchaseValue);
    row.querySelector('.current-value').textContent = formatCurrency(currentValue);
    const roiCell = row.querySelector('.roi-value');
    roiCell.textContent = `${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%`;
    roiCell.classList.toggle('positive', roi >= 0);
    roiCell.classList.toggle('negative', roi < 0);

    renderHoldingsProfitability();
}

function renderHoldingsProfitability() {
    const tbody = document.getElementById('holdingsProfitabilityBody');
    const thead = document.getElementById('holdingsProfitabilityHead');
    const title = document.getElementById('holdingsProfitabilityTitle');
    const empty = document.getElementById('holdingsProfitabilityEmpty');
    if (!tbody || !thead || !title || !empty) return;

    if (!editedAssets.length) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    const totalCurrent = editedAssets.reduce((sum, asset) => sum + (asset[AssetIndex.CURRENT_VALUE] || 0), 0) || 1;

    if (holdingsProfitabilityMode === 'asset') {
        title.textContent = 'Rentabilidad por activo';
        thead.innerHTML = '<tr><th>Activo</th><th>Categoría</th><th>Invertido</th><th>Valor</th><th>ROI</th><th>Peso</th></tr>';

        const grouped = new Map();
        editedAssets.forEach(asset => {
            const name = asset[AssetIndex.NAME] || 'Sin nombre';
            const category = asset[AssetIndex.CATEGORY] || 'Sin categoría';
            const key = `${name}::${category}`;
            const invested = asset[AssetIndex.PURCHASE_VALUE] || 0;
            const current = asset[AssetIndex.CURRENT_VALUE] || 0;

            if (!grouped.has(key)) {
                grouped.set(key, { name, category, invested: 0, current: 0 });
            }

            const row = grouped.get(key);
            row.invested += invested;
            row.current += current;
        });

        const rows = Array.from(grouped.values())
            .map(row => {
                const roi = row.invested > 0 ? ((row.current - row.invested) / row.invested) * 100 : 0;
                const allocation = (row.current / totalCurrent) * 100;
                return { ...row, roi, allocation };
            })
            .sort((a, b) => {
                if (b.roi !== a.roi) return b.roi - a.roi;
                return b.current - a.current;
            });

        tbody.innerHTML = rows.map(row => {
            const roiClass = row.roi >= 0 ? 'positive' : 'negative';
            return `
                <tr>
                    <td><strong>${truncate(row.name, 34)}</strong></td>
                    <td>${row.category}</td>
                    <td>${formatCurrency(row.invested)}</td>
                    <td>${formatCurrency(row.current)}</td>
                    <td class="${roiClass}"><strong>${row.roi >= 0 ? '+' : ''}${row.roi.toFixed(2)}%</strong></td>
                    <td class="metric-muted">${row.allocation.toFixed(1)}%</td>
                </tr>
            `;
        }).join('');
        return;
    }

    title.textContent = 'Rentabilidad por categoría';
    thead.innerHTML = '<tr><th>Categoría</th><th>Invertido</th><th>Valor</th><th>ROI</th><th>Peso</th></tr>';

    const groupedByCategory = new Map();
    editedAssets.forEach(asset => {
        const category = asset[AssetIndex.CATEGORY] || 'Sin categoría';
        const invested = asset[AssetIndex.PURCHASE_VALUE] || 0;
        const current = asset[AssetIndex.CURRENT_VALUE] || 0;
        if (!groupedByCategory.has(category)) {
            groupedByCategory.set(category, { category, invested: 0, current: 0 });
        }
        const row = groupedByCategory.get(category);
        row.invested += invested;
        row.current += current;
    });

    const categoryRows = Array.from(groupedByCategory.values())
        .map(row => {
            const roi = row.invested > 0 ? ((row.current - row.invested) / row.invested) * 100 : 0;
            const allocation = (row.current / totalCurrent) * 100;
            return { ...row, roi, allocation };
        })
        .sort((a, b) => {
            if (b.roi !== a.roi) return b.roi - a.roi;
            return b.current - a.current;
        });

    tbody.innerHTML = categoryRows.map(row => {
        const roiClass = row.roi >= 0 ? 'positive' : 'negative';
        return `
            <tr>
                <td><strong>${row.category}</strong></td>
                <td>${formatCurrency(row.invested)}</td>
                <td>${formatCurrency(row.current)}</td>
                <td class="${roiClass}"><strong>${row.roi >= 0 ? '+' : ''}${row.roi.toFixed(2)}%</strong></td>
                <td class="metric-muted">${row.allocation.toFixed(1)}%</td>
            </tr>
        `;
    }).join('');
}

function truncate(value, max) {
    if (!value) return '';
    return value.length > max ? `${value.substring(0, max - 3)}...` : value;
}

function openSaveModal() {
    if (snapshots.length === 0) return;
    const modal = document.getElementById('saveModal');
    const title = document.getElementById('saveModalTitle');
    const message = document.getElementById('saveModalMessage');
    if (!modal || !title || !message) return;

    const today = new Date();
    const todayKey = today.toISOString().split('T')[0];
    const baseKey = baseSnapshotDate ? baseSnapshotDate.split('T')[0] : '';
    const isSameDay = todayKey === baseKey;
    const summary = buildChangeSummary(isSameDay);

    title.textContent = summary.title;
    message.textContent = summary.message;
    modal.classList.add('show');
}

function hideSaveModal() {
    const modal = document.getElementById('saveModal');
    if (modal) modal.classList.remove('show');
}

function confirmSaveChanges() {
    hideSaveModal();
    saveHoldingsChanges();
}

function saveHoldingsChanges() {
    if (snapshots.length === 0) return;

    const latestSnapshot = snapshots.at(-1);
    if (!latestSnapshot) return;

    const today = new Date();
    const todayKey = today.toISOString().split('T')[0];
    const baseKey = baseSnapshotDate ? baseSnapshotDate.split('T')[0] : '';
    const isSameDay = todayKey === baseKey;

    const summary = buildChangeSummary(isSameDay);

    if (isSameDay) {
        latestSnapshot.assets = editedAssets.map(a => [...a]);
    } else {
        latestSnapshot.assets = originalAssets.map(a => [...a]);
        snapshots.push({
            id: Date.now(),
            date: new Date().toISOString(),
            assets: editedAssets.map(a => [...a])
        });
    }

    const updated = snapshots.map(s => ({
        id: s.id,
        date: s.date,
        assets: s.assets
    }));

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    localStorage.setItem(HOLDINGS_CHANGES_KEY, summary.message);

    window.location.href = '/finanzas/';
}

function buildChangeSummary(isSameDay) {
    const beforeTotals = getTotals(originalAssets);
    const afterTotals = getTotals(editedAssets);
    const deltaValue = afterTotals.current - beforeTotals.current;
    const deltaInvested = afterTotals.purchase - beforeTotals.purchase;

    const changed = editedAssets.reduce((list, asset, i) => {
        const prev = originalAssets[i];
        if (!prev) return list;
        const changes = [];
        if (asset[AssetIndex.QUANTITY] !== prev[AssetIndex.QUANTITY]) changes.push('cantidad');
        if (asset[AssetIndex.PURCHASE_PRICE] !== prev[AssetIndex.PURCHASE_PRICE]) changes.push('compra');
        if (asset[AssetIndex.CURRENT_PRICE] !== prev[AssetIndex.CURRENT_PRICE]) changes.push('precio');
        if (changes.length) {
            list.push(`${asset[AssetIndex.NAME]}: ${changes.join(', ')}`);
        }
        return list;
    }, []);

    const action = isSameDay ? 'Snapshot actualizado' : 'Nuevo snapshot creado';
    const lines = [
        action,
        `Valor total: ${formatCurrency(beforeTotals.current)} → ${formatCurrency(afterTotals.current)} (${deltaValue >= 0 ? '+' : ''}${formatCurrency(deltaValue)})`,
        `Invertido: ${formatCurrency(beforeTotals.purchase)} → ${formatCurrency(afterTotals.purchase)} (${deltaInvested >= 0 ? '+' : ''}${formatCurrency(deltaInvested)})`,
        `Activos modificados: ${changed.length}`
    ];

    if (changed.length) {
        lines.push('Detalles:');
        lines.push(...changed.slice(0, 6).map(item => `• ${item}`));
        if (changed.length > 6) lines.push(`• +${changed.length - 6} más`);
    }

    return {
        title: 'Confirmar cambios',
        message: lines.join('\n')
    };
}

function getTotals(assets) {
    const purchase = assets.reduce((sum, a) => sum + (a[AssetIndex.PURCHASE_VALUE] || 0), 0);
    const current = assets.reduce((sum, a) => sum + (a[AssetIndex.CURRENT_VALUE] || 0), 0);
    return { purchase, current };
}
