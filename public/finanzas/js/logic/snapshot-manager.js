/**
 * Snapshot Manager Module (SOLID - SRP)
 * Handles all logic related to snapshots: CRUD, parsing, and category filtering.
 */

import { AssetIndex, SELECTED_CATEGORY_KEY } from "../shared/constants.js";
import { store } from "../core/data-store.js";
import { showToast } from "../shared/toast.js";
import { 
    cloneDeep, 
    calculateSnapshotMetrics,
    getSnapshotsForRange as getSnapshotsForRangeUtil,
    getMonthlySnapshotsForRange as getMonthlySnapshotsForRangeUtil,
    getSnapshotsForChartRange as getSnapshotsForChartRangeUtil,
    getAssetTotals as getAssetTotalsUtil,
    parseData
} from "../shared/portfolio-utils.js";
import { $, setText, escapeHtml } from "../ui/ui-shared.js";

// State managed by this module
export let selectedCategory = null;

/**
 * Initializes the snapshot manager.
 */
export function initSnapshots() {
    store._loadSnapshots();
    loadSelectedCategory();
}

/**
 * Saves current snapshots and triggers sync.
 */
export function saveSnapshots() {
    store._saveSnapshotsAndSync();
}

/**
 * Toggles the visibility of the capture modal.
 */
export function toggleCaptureModal(show) {
    const modal = $("captureModal");
    if (modal) modal.classList.toggle("show", show);
}

/**
 * Captures a new snapshot from the UI input.
 */
export function captureSnapshot(onUpdate) {
    const input = $("snapshotData").value;
    const dateValue = $("snapshotDate").value;
    const tagValue = $("snapshotTag")?.value || "";
    const noteValue = $("snapshotNote")?.value || "";

    if (!input.trim()) {
        showToast("Por favor, pega los datos de tu cartera", "error");
        return;
    }

    if (!dateValue) {
        showToast("Por favor, selecciona una fecha", "error");
        return;
    }

    const assets = parseData(input);
    if (assets.length === 0) {
        showToast("No se pudieron parsear los datos. Verifica el formato.", "error");
        return;
    }

    const snapshotRaw = {
        id: Date.now(),
        date: new Date(dateValue).toISOString(),
        assets,
        tag: tagValue.trim(),
        note: noteValue.trim(),
    };

    const snapshot = calculateSnapshotMetrics(snapshotRaw);

    store.snapshots.push(snapshot);
    store.snapshots.sort((a, b) => new Date(a.date) - new Date(b.date));

    saveSnapshots();
    
    // Clear inputs
    $("snapshotData").value = "";
    if ($("snapshotTag")) $("snapshotTag").value = "";
    if ($("snapshotNote")) $("snapshotNote").value = "";
    
    toggleCaptureModal(false);
    showToast("Snapshot guardado", "success");
    
    if (onUpdate) onUpdate();
}

/**
 * Deletes a snapshot by ID.
 */
export function deleteSnapshot(id, onUpdate) {
    if (!confirm("¿Seguro que quieres eliminar este snapshot?")) return;
    store.snapshots = store.snapshots.filter((s) => s.id !== id);
    saveSnapshots();
    showToast("Snapshot eliminado", "success");
    if (onUpdate) onUpdate();
}

/**
 * Opens the edit modal for a specific snapshot.
 */
export function openEditSnapshot(snapshotId) {
    const snapshot = store.snapshots.find((s) => s.id === snapshotId);
    if (!snapshot) return;

    $("editSnapshotId").value = snapshotId;
    $("editSnapshotDate").value = snapshot.date.split("T")[0];
    if ($("editSnapshotTag")) $("editSnapshotTag").value = snapshot.tag || "";
    if ($("editSnapshotNote")) $("editSnapshotNote").value = snapshot.note || "";

    const lines = snapshot.assets
        .map((a) => {
            return [
                a[AssetIndex.NAME],
                a[AssetIndex.TERM],
                a[AssetIndex.CATEGORY],
                a[AssetIndex.PURCHASE_PRICE].toFixed(2).replace(".", ",") + " €",
                a[AssetIndex.QUANTITY].toString().replace(".", ","),
                a[AssetIndex.CURRENT_PRICE].toFixed(2).replace(".", ",") + " €",
                a[AssetIndex.PURCHASE_VALUE].toFixed(2).replace(".", ",") + " €",
                a[AssetIndex.CURRENT_VALUE].toFixed(2).replace(".", ",") + " €",
            ].join("\t");
        })
        .join("\n");

    $("editSnapshotData").value = lines;
    renderEditPreview();
    toggleEditModal(true);
}

/**
 * Toggles the edit modal.
 */
export function toggleEditModal(show) {
    const modal = $("editModal");
    if (modal) modal.classList.toggle("show", show);
}

/**
 * Renders a preview of the edited data.
 */
export function renderEditPreview() {
    const tbody = $("editPreviewBody");
    const countEl = $("editPreviewCount");
    const textarea = $("editSnapshotData");
    if (!tbody || !textarea) return;

    const raw = textarea.value.trim();
    if (!raw) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Sin datos</td></tr>';
        if (countEl) countEl.textContent = "0 filas";
        return;
    }

    const lines = raw.split("\n").filter((line) => line.trim());
    if (countEl) countEl.textContent = `${lines.length} fila${lines.length === 1 ? "" : "s"}`;

    const rows = lines.map((line) => {
        const parts = line.split("\t");
        return {
            name: parts[0] ? parts[0].trim() : "- ",
            term: parts[1] ? parts[1].trim() : "- ",
            category: parts[2] ? parts[2].trim() : "- ",
            purchasePrice: parts[3] ? parts[3].trim() : "- ",
            quantity: parts[4] ? parts[4].trim() : "- ",
            currentPrice: parts[5] ? parts[5].trim() : "- ",
        };
    });

    tbody.innerHTML = rows
        .map(
            (row) => `
        <tr>
            <td>${escapeHtml(row.name)}</td>
            <td>${escapeHtml(row.term)}</td>
            <td>${escapeHtml(row.category)}</td>
            <td>${escapeHtml(row.purchasePrice)}</td>
            <td>${escapeHtml(row.quantity)}</td>
            <td>${escapeHtml(row.currentPrice)}</td>
        </tr>
    `,
        )
        .join("");
}

/**
 * Saves the edited snapshot.
 */
export function saveEditedSnapshot(onUpdate) {
    const snapshotId = parseInt($("editSnapshotId").value);
    const dateValue = $("editSnapshotDate").value;
    const input = $("editSnapshotData").value;
    const tagValue = $("editSnapshotTag")?.value || "";
    const noteValue = $("editSnapshotNote")?.value || "";

    if (!input.trim() || !dateValue) {
        showToast("Los campos no pueden estar vacíos", "error");
        return;
    }

    const assets = parseData(input);
    if (assets.length === 0) {
        showToast("No se pudieron parsear los datos. Verifica el formato.", "error");
        return;
    }

    const index = store.snapshots.findIndex((s) => s.id === snapshotId);
    if (index === -1) return;

    const snapshotRaw = {
        id: snapshotId,
        date: new Date(dateValue).toISOString(),
        assets,
        tag: tagValue.trim(),
        note: noteValue.trim(),
    };

    store.snapshots[index] = calculateSnapshotMetrics(snapshotRaw);
    store.snapshots.sort((a, b) => new Date(a.date) - new Date(b.date));

    saveSnapshots();
    toggleEditModal(false);
    showToast("Snapshot actualizado", "success");
    if (onUpdate) onUpdate();
}

/**
 * Persists the selected category to local storage.
 */
export function persistSelectedCategory() {
    if (selectedCategory) {
        localStorage.setItem(SELECTED_CATEGORY_KEY, selectedCategory);
    } else {
        localStorage.removeItem(SELECTED_CATEGORY_KEY);
    }
}

/**
 * Loads the selected category from local storage.
 */
export function loadSelectedCategory() {
    const stored = localStorage.getItem(SELECTED_CATEGORY_KEY);
    if (!stored) return;

    if (store.snapshots.length === 0) {
        selectedCategory = null;
        return;
    }

    const latestSnapshot = store.snapshots[store.snapshots.length - 1];
    const categories = Object.keys(latestSnapshot.categoryTotals || {});
    selectedCategory = categories.includes(stored) ? stored : null;
}

/**
 * Returns snapshots within the selected range.
 */
export function getSnapshotsForRange(range) {
    return getSnapshotsForRangeUtil(store.snapshots, range);
}

/**
 * Returns monthly snapshots within the selected range.
 */
export function getMonthlySnapshotsForRange(range) {
    return getMonthlySnapshotsForRangeUtil(store.snapshots, range);
}

/**
 * Returns chart-optimized snapshots within the selected range.
 */
export function getSnapshotsForChartRange(range) {
    return getSnapshotsForChartRangeUtil(store.snapshots, range);
}

/**
 * Filters assets of a snapshot by the currently selected category (if any).
 */
export function getSelectedAssets(snapshot) {
    if (!snapshot) return [];
    if (!selectedCategory) return snapshot.assets || [];
    return (snapshot.assets || []).filter(
        (a) => a[AssetIndex.CATEGORY] === selectedCategory
    );
}

/**
 * Calculates total current and purchase value for a snapshot, considering the active filter.
 */
export function getAssetTotals(snapshot) {
    if (!snapshot) return { value: 0, invested: 0 };
    return getAssetTotalsUtil(snapshot, selectedCategory);
}

/**
 * Selects a category and updates the UI.
 */
export function selectCategory(category, onUpdate) {
    selectedCategory = category;
    const selector = $("categorySelector");
    if (selector) selector.value = category || "";
    persistSelectedCategory();
    if (onUpdate) onUpdate();
}

/**
 * Populates the category selector dropdown.
 */
export function populateCategorySelector() {
    const selector = $("categorySelector");
    if (!selector) return;
    
    const currentValue = selectedCategory || selector.value;
    let options = '<option value="">Portfolio Global</option>';

    if (store.snapshots.length > 0) {
        const latestSnapshot = store.snapshots[store.snapshots.length - 1];
        const categories = Object.keys(latestSnapshot.categoryTotals).sort((a, b) =>
            a.localeCompare(b, "es"),
        );
        categories.forEach((cat) => {
            const selected = cat === currentValue ? "selected" : "";
            options += `<option value="${escapeHtml(cat)}" ${selected}>${escapeHtml(cat)}</option>`;
        });
    }

    selector.innerHTML = options;
    selector.value = currentValue || "";
}
