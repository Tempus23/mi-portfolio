/**
 * History UI Module (SOLID - SRP)
 * Handles the rendering of the historical snapshots table and detailed view.
 */

import { AssetIndex } from "../shared/constants.js";
import { store } from "../core/data-store.js";
import { formatCurrency } from "../shared/format.js";
import { $, setText, escapeHtml } from "../ui/ui-shared.js";
import * as SnapshotManager from "../logic/snapshot-manager.js";
import { exportSnapshotToClipboard } from "../core/portfolio-export.js";

/**
 * Updates the historical snapshots table.
 */
export function updateHistoryTable(onUpdate) {
    const tbody = $("historyBody");
    const emptyState = $("emptyState");
    if (!tbody || !emptyState) return;

    if (store.snapshots.length === 0) {
        tbody.innerHTML = "";
        emptyState.style.display = "block";
        return;
    }

    emptyState.style.display = "none";
    tbody.innerHTML = store.snapshots
        .slice()
        .reverse()
        .map((snapshot) => {
            const date = new Date(snapshot.date);
            const formattedDate = date.toLocaleDateString("es-ES", {
                year: "numeric", month: "short", day: "numeric",
                hour: "2-digit", minute: "2-digit",
            });

            const variationClass = snapshot.variation >= 0 ? "positive" : "negative";
            const variationSign = snapshot.variation >= 0 ? "+" : "";

            const tag = snapshot.tag ? `<span class="history-tag">${escapeHtml(snapshot.tag)}</span>` : "";
            const note = snapshot.note ? `<span class="history-note">${escapeHtml(snapshot.note)}</span>` : "";
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
        })
        .join("");
}

/**
 * Renders the detailed view of a specific snapshot.
 */
export function viewSnapshot(id) {
    const snapshot = store.snapshots.find((s) => s.id === id);
    if (!snapshot) return;

    const section = $("assetsSection");
    if (section) section.style.display = "block";

    const date = new Date(snapshot.date);
    const dateLabel = date.toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" });
    const metaParts = [];
    if (snapshot.tag) metaParts.push(snapshot.tag);
    if (snapshot.note) metaParts.push(snapshot.note);
    
    setText("assetsDate", metaParts.length ? `${dateLabel} · ${metaParts.join(" · ")}` : dateLabel);

    const tbody = $("assetsBody");
    if (!tbody) return;

    tbody.innerHTML = snapshot.assets
        .map((asset) => {
            const variation = (asset[AssetIndex.CURRENT_VALUE] || 0) - (asset[AssetIndex.PURCHASE_VALUE] || 0);
            const variationClass = variation >= 0 ? "positive" : "negative";
            const variationSign = variation >= 0 ? "+" : "";
            
            const categoryClass = (asset[AssetIndex.CATEGORY] || "").toLowerCase().replace(/\s+/g, "-");
            const termClass = (asset[AssetIndex.TERM] || "").toLowerCase().replace(/\s+/g, "-");

            return `
            <tr>
                <td><strong>${escapeHtml(asset[AssetIndex.NAME])}</strong></td>
                <td><span class="term-badge term-${termClass}">${escapeHtml(asset[AssetIndex.TERM])}</span></td>
                <td><span class="category-badge category-${categoryClass}">${escapeHtml(asset[AssetIndex.CATEGORY])}</span></td>
                <td>${formatCurrency(asset[AssetIndex.PURCHASE_PRICE])}</td>
                <td>${(asset[AssetIndex.QUANTITY] || 0).toLocaleString("es-ES", { minimumFractionDigits: 3 })}</td>
                <td>${formatCurrency(asset[AssetIndex.CURRENT_PRICE])}</td>
                <td>${formatCurrency(asset[AssetIndex.PURCHASE_VALUE])}</td>
                <td>${formatCurrency(asset[AssetIndex.CURRENT_VALUE])}</td>
                <td class="${variationClass}">${variationSign}${formatCurrency(variation)}</td>
            </tr>
            `;
        })
        .join("");

    section.scrollIntoView({ behavior: "smooth" });
}

/**
 * Handles action buttons in the history table.
 */
export function handleHistoryActions(action, id, onUpdate) {
    switch (action) {
        case "view":
            viewSnapshot(id);
            break;
        case "copy":
            const snapshot = store.snapshots.find(s => s.id === id);
            if (snapshot) exportSnapshotToClipboard(snapshot);
            break;
        case "edit":
            SnapshotManager.openEditSnapshot(id);
            break;
        case "delete":
            SnapshotManager.deleteSnapshot(id, onUpdate);
            break;
    }
}
