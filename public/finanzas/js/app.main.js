/**
 * Main Orquestador (SOLID - SRP)
 * Handles high-level initialization, event routing, and UI orchestration.
 */

import { STORAGE_KEYS } from "./shared/constants.js";
import { formatCurrency } from "./shared/format.js";
import { showToast } from "./shared/toast.js";
import { syncPull, syncPush, setSyncCallback } from "./shared/sync.js";
import { store } from "./core/data-store.js";
import { initCharts } from "./ui/chart-manager.js";
import { $, on, setText } from "./ui/ui-shared.js";
import { exportToJson, exportLatestSnapshotToClipboard, processImportedJson } from "./core/portfolio-export.js";

import * as SnapshotManager from "./logic/snapshot-manager.js";
import * as TargetsManager from "./logic/targets-manager.js";
import * as AnalyticsCore from "./logic/analytics-core.js";
import * as ChartLogic from "./logic/chart-logic.js";
import * as CompositionUI from "./ui/composition-ui.js";
import * as SummaryUI from "./ui/summary-ui.js";
import * as HistoryUI from "./ui/history-ui.js";

// Global-ish state (managed here for orchestration)
let evolutionChart = null;
let roiEvolutionChart = null;
let distributionChart = null;
let currentRange = "all";
let compositionCompareMonths = 1;

/**
 * Initialization function.
 */
function init() {
    SnapshotManager.initSnapshots();
    TargetsManager.initTargets();
    
    // Initialize charts from chart-manager
    const charts = initCharts(formatCurrency);
    evolutionChart = charts.evolutionChart;
    roiEvolutionChart = charts.roiEvolutionChart;
    distributionChart = charts.distributionChart;

    setupEventListeners();
    updateUI();
    showHoldingsChangesIfAny();

    // Cloud sync setup
    setSyncCallback(() => {
        store.loadAll();
        updateUI();
    });

    // Initial sync
    syncPull(showToast).then(() => updateUI());
}

/**
 * Event Listener Setup.
 */
function setupEventListeners() {
    // Range buttons
    document.querySelectorAll(".range-btn").forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll(".range-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            currentRange = e.target.dataset.range;
            updateUI();
        };
    });

    // Chart Mode filters
    document.querySelectorAll(".segment").forEach(btn => {
        if (btn.closest("#distributionModeFilter")) return;
        btn.onclick = (e) => {
            document.querySelectorAll(".segment:not(#distributionModeFilter .segment)").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            ChartLogic.setChartModes({ currentChartMode: e.target.dataset.filter });
            updateEvolutionChart();
        };
    });

    // ROI filters
    document.querySelectorAll(".segment-roi").forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll(".segment-roi").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            ChartLogic.setChartModes({ currentRoiMode: e.target.dataset.roi });
            updateRoiEvolutionChart();
        };
    });

    // Distribution filters
    document.querySelectorAll("#distributionModeFilter .segment").forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll("#distributionModeFilter .segment").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            ChartLogic.setChartModes({ currentDistributionMode: e.target.dataset.dist });
            updateDistributionCharts();
        };
    });

    // Chart Options (Log, Min)
    $("roiCumulativeByCategory")?.addEventListener("change", (e) => {
        ChartLogic.setChartModes({ roiCumulativeByCategory: !!e.target.checked });
        updateRoiEvolutionChart();
    });

    $("evolutionLogScale")?.addEventListener("change", (e) => {
        ChartLogic.setChartModes({ evolutionScaleMode: e.target.checked ? "logarithmic" : "linear" });
        updateEvolutionChart();
    });

    $("evolutionMinScale")?.addEventListener("change", (e) => {
        ChartLogic.setChartModes({ evolutionMinMode: e.target.checked ? "min" : "zero" });
        updateEvolutionChart();
    });

    // Category Selector
    on("categorySelector", "change", (e) => {
        SnapshotManager.selectCategory(e.target.value || null, updateViewMode);
    });
    
    // Sync & Export
    on("syncPullBtn", "click", () => syncPull(showToast).then(updateUI));
    on("syncPushBtn", "click", () => syncPush(showToast));
    on("exportJsonBtn", "click", () => exportToJson(store.snapshots));
    on("exportTsvBtn", "click", () => exportLatestSnapshotToClipboard(store.snapshots));
    on("importJsonInput", "change", handleImportFromJson);

    // Capture & Edit
    on("captureBtn", "click", () => SnapshotManager.toggleCaptureModal(true));
    on("cancelCapture", "click", () => SnapshotManager.toggleCaptureModal(false));
    on("saveCapture", "click", () => SnapshotManager.captureSnapshot(updateUI));
    
    on("cancelEdit", "click", () => SnapshotManager.toggleEditModal(false));
    on("saveEdit", "click", () => SnapshotManager.saveEditedSnapshot(updateUI));
    on("editSnapshotData", "input", SnapshotManager.renderEditPreview);

    // Targets
    on("toggleTargetsEditBtn", "click", () => {
        if (TargetsManager.targetsEditMode) TargetsManager.cancelTargetsEditMode(TargetsManager.updateTargetsTable);
        else TargetsManager.enterTargetsEditMode(TargetsManager.updateTargetsTable);
    });
    on("saveTargetsBtn", "click", () => TargetsManager.saveTargetsEditMode(updateUI));
    on("cancelTargetsEditBtn", "click", () => {
        TargetsManager.cancelTargetsEditMode(TargetsManager.updateTargetsTable);
    });

    // History Table Actions (Delegation)
    document.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        HistoryUI.handleHistoryActions(btn.dataset.action, Number(btn.dataset.id), updateUI);
    });

    // Compare Range
    $("compositionCompare")?.addEventListener("change", (e) => {
        compositionCompareMonths = parseInt(e.target.value, 10) || 1;
        CompositionUI.updateCompositionList(compositionCompareMonths);
    });

    $("opportunityRange")?.addEventListener("change", (e) => {
        AnalyticsCore.setOpportunityRangeMonths(parseInt(e.target.value, 10) || 1);
        AnalyticsCore.updateOpportunities();
    });

    // Navigation
    on("openHoldingsBtn", "click", () => { globalThis.location.href = "/finanzas/investments.html"; });
}

/**
 * Updates the entire UI.
 */
function updateUI() {
    SnapshotManager.populateCategorySelector();
    SummaryUI.updateSummary();
    HistoryUI.updateHistoryTable(updateUI);
    updateEvolutionChart();
    updateRoiEvolutionChart();
    updateDistributionCharts();
    updateAnalytics();
    TargetsManager.updateTargetsTable();
}

function updateViewMode() {
    // Logic for swapping titles based on category selection
    const sel = SnapshotManager.selectedCategory;
    const hero = sel || "Valor Total";
    const evolution = sel ? "Evolución de " + sel : "Evolución";
    const diversification = sel ? "Composición de " + sel : "Diversificación Histórica";

    document.title = sel ? `Finanzas - ${sel}` : "Finanzas - Portfolio Global";
    setText("heroLabel", hero);
    setText("evolutionTitle", evolution);
    setText("diversificationTitle", diversification);

    updateUI();
}

function updateEvolutionChart() {
    ChartLogic.updateEvolutionChart(evolutionChart, currentRange, SnapshotManager.selectedCategory);
}

function updateRoiEvolutionChart() {
    ChartLogic.updateRoiEvolutionChart(roiEvolutionChart, currentRange, SnapshotManager.selectedCategory);
}

function updateDistributionCharts() {
    ChartLogic.updateDistributionCharts(distributionChart, currentRange, SnapshotManager.selectedCategory);
}

function updateAnalytics() {
    AnalyticsCore.updateAnalytics(currentRange);
    CompositionUI.updateCompositionList(compositionCompareMonths);
    AnalyticsCore.updateOpportunities();
}

async function handleImportFromJson(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        const optimized = await processImportedJson(text);
        if (optimized) {
            store.snapshots = optimized;
            SnapshotManager.saveSnapshots();
            updateUI();
        }
    } catch (e) {
        showToast("Error al importar el archivo", "error");
    }
}

function showHoldingsChangesIfAny() {
    const message = localStorage.getItem(STORAGE_KEYS.HOLDINGS_CHANGES);
    if (!message) return;
    localStorage.removeItem(STORAGE_KEYS.HOLDINGS_CHANGES);
    
    // Simple custom modal orchestration or just showToast if enough
    const modal = $("modal");
    if (!modal) return;
    $("modalTitle").textContent = "Cambios guardados";
    $("modalMessage").textContent = message;
    $("modalCancel").style.display = "none";
    modal.classList.add("show");
    $("modalConfirm").onclick = () => modal.classList.remove("show");
}

function hideModal() {
    $("modal")?.classList.remove("show");
}

document.addEventListener("DOMContentLoaded", init);
