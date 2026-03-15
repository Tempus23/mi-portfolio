/**
 * Targets Manager Module (SOLID - SRP)
 * Handles all logic related to financial targets, objectives and budget distribution.
 */

import { 
    TARGET_EDIT_LOCK_MONTHS, 
    TARGET_EDIT_WINDOW_HOURS, 
    TARGET_ADJUSTMENT_HARDNESS_DEFAULT,
    AssetIndex
} from "../shared/constants.js";
import { store } from "../core/data-store.js";
import { 
    cloneDeep, 
    hasObjectiveChanges, 
    buildTargetEditPolicy,
    calculateAssetProximity,
    distributeMonthlyBudget,
    getTargetAdjustmentAdvice,
    formatCurrency,
    calculatePeriodMetrics
} from "../shared/portfolio-utils.js";
import { showToast } from "../shared/toast.js";
import { $, setText, escapeHtml } from "../ui/ui-shared.js";
import { selectedCategory } from "./snapshot-manager.js";

// State managed by this module
export let targetsEditMode = false;
export let targetsDraft = null;
export let targetsMetaDraft = null;

/**
 * Initializes the targets manager.
 */
export function initTargets() {
    store._loadTargets();
    store._loadTargetsMeta();
}

/**
 * Returns the active targets (original or draft).
 */
export function getWorkingTargets() {
    return targetsEditMode && targetsDraft ? targetsDraft : store.targets;
}

/**
 * Returns the active targets metadata (original or draft).
 */
export function getWorkingTargetsMeta() {
    return targetsEditMode && targetsMetaDraft ? targetsMetaDraft : store.targetsMeta;
}

/**
 * Enters edit mode for targets.
 */
export function enterTargetsEditMode(onUpdate) {
    targetsEditMode = true;
    targetsDraft = cloneDeep(store.targets);
    targetsMetaDraft = cloneDeep(store.targetsMeta);
    if (onUpdate) onUpdate();
}

/**
 * Cancels edit mode for targets.
 */
export function cancelTargetsEditMode(onUpdate) {
    targetsEditMode = false;
    targetsDraft = null;
    targetsMetaDraft = null;
    if (onUpdate) onUpdate();
}

/**
 * Saves the edited targets.
 */
export function saveTargetsEditMode(onUpdate) {
    if (!targetsEditMode || !targetsDraft || !targetsMetaDraft) return;

    const objectiveChanged = hasObjectiveChanges(store.targets, targetsDraft);
    const targetEditPolicy = getTargetEditPolicy();

    if (objectiveChanged && !targetEditPolicy.canEdit) {
        showToast(targetEditPolicy.lockMessage, "error");
        if (onUpdate) onUpdate();
        return;
    }

    if (objectiveChanged && targetEditPolicy.shouldStartNewWindow) {
        targetsMetaDraft.lastObjectiveUpdateAt = new Date().toISOString();
    }

    store.saveTargets(cloneDeep(targetsDraft));
    store.saveTargetsMeta(cloneDeep(targetsMetaDraft));

    targetsEditMode = false;
    targetsDraft = null;
    targetsMetaDraft = null;

    showToast("Cambios de objetivos guardados", "success");
    if (onUpdate) onUpdate();
}

/**
 * Returns the target edit policy.
 */
export function getTargetEditPolicy(now = new Date()) {
    return buildTargetEditPolicy({
        lastObjectiveUpdateAt: store.targetsMeta.lastObjectiveUpdateAt,
        now,
        lockMonths: TARGET_EDIT_LOCK_MONTHS,
        windowHours: TARGET_EDIT_WINDOW_HOURS,
    });
}

/**
 * Clamps the adjustment hardness value.
 */
export function clampAdjustmentHardness(value) {
    return Math.max(0, Math.min(1, value));
}

/**
 * Auto-balances targets monthly budget allocation based on current deviation.
 */
export function autoBalanceTargets(onUpdate) {
    if (store.snapshots.length === 0) return;

    const workingTargets = getWorkingTargets();
    const workingMeta = getWorkingTargetsMeta();

    const latestSnapshot = store.snapshots[store.snapshots.length - 1];
    const categories = Object.keys(latestSnapshot.categoryTotals);
    const totalValue = categories.reduce(
        (sum, cat) => sum + (latestSnapshot.categoryTotals[cat] || 0),
        0,
    );
    const totalMonthly = workingMeta.monthlyBudget || 0;

    if (totalMonthly <= 0 || totalValue <= 0) return;

    const sumTargets =
        categories.reduce(
            (sum, cat) => sum + (workingTargets[cat]?.target ?? 0),
            0,
        ) || 1;
    const minFloorRatio = 0.25;
    const adjustFactor = 0.6;

    const weights = categories.map((cat) => {
        const currentValue = latestSnapshot.categoryTotals[cat] || 0;
        const currentPct = totalValue > 0 ? (currentValue / totalValue) * 100 : 0;
        const target = workingTargets[cat]?.target ?? 0;
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
        workingTargets[cat] = {
            ...(workingTargets[cat] || {}),
            monthly: Number.isFinite(allocation) ? Math.round(allocation) : 0,
        };
    });
    
    if (onUpdate) onUpdate();
}

/**
 * Updates the targets table in the UI.
 */
export function updateTargetsTable() {
    const tbody = $("targetsBody");
    const monthlyTotalEl = $("monthlyTotal");
    const targetsTotalIndicator = $("targetsTotalIndicator");
    const targetsHead = $("targetsHead");
    if (!tbody) return;

    if (store.snapshots.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No hay datos suficientes</td></tr>';
        if (monthlyTotalEl) monthlyTotalEl.textContent = formatCurrency(0);
        return;
    }

    const latestSnapshot = store.snapshots[store.snapshots.length - 1];
    const totalValue = latestSnapshot.totalCurrentValue || 0;
    let monthlyTotal = 0;

    const workingTargets = getWorkingTargets();
    const workingMeta = getWorkingTargetsMeta();
    const targetEditPolicy = getTargetEditPolicy();

    const categories = Object.keys(latestSnapshot.categoryTotals).sort();
    const { rows } = distributeMonthlyBudget({
        categories,
        categoryTotals: latestSnapshot.categoryTotals,
        totalValue,
        targets: workingTargets,
        monthlyBudget: workingMeta.monthlyBudget || 0,
        adjustmentHardness: workingMeta.adjustmentHardness ?? TARGET_ADJUSTMENT_HARDNESS_DEFAULT,
    });

    const maxAbsCombinedAdjustment = Math.max(
        ...rows.map((row) => Math.abs(row.adjustmentPp || 0)),
        1,
    );

    const targetsSum = rows.reduce((sum, row) => sum + row.target, 0);
    const deltaTo100 = 100 - targetsSum;

    if (targetsHead) {
        targetsHead.innerHTML = "<tr><th>Categoría</th><th>Actual %</th><th>Objetivo %</th><th>Aporte mensual</th><th>Ajuste sugerido</th></tr>";
    }
    if (targetsTotalIndicator) {
        const sign = deltaTo100 >= 0 ? "Falta" : "Sobra";
        targetsTotalIndicator.textContent = `Objetivos: ${targetsSum.toFixed(1)}% · ${sign} ${Math.abs(deltaTo100).toFixed(1)}% · ${targetEditPolicy.lockMessage}`;
        targetsTotalIndicator.className = `targets-indicator ${Math.abs(deltaTo100) < 0.1 ? "ok" : "warn"}`;
    }

    rows.sort((a, b) => (b.currentPct - a.currentPct) || a.cat.localeCompare(b.cat, "es"));

    tbody.innerHTML = rows
        .map((row) => {
            monthlyTotal += row.monthly;
            const isNeutral = Math.abs(row.adjustmentPp) < 0.5;
            const combinedClass = isNeutral ? "neutral" : row.adjustmentPp >= 0 ? "positive" : "negative";
            const normalizedRange = Math.min(Math.abs(row.adjustmentPp) / maxAbsCombinedAdjustment, 1) * 50;
            const rangeStart = row.adjustmentPp >= 0 ? 50 : 50 - normalizedRange;
            const actionLabel = isNeutral ? "Mantener" : row.adjustmentPp >= 0 ? "Subir" : "Bajar";
            
            return `
            <tr>
                <td><strong>${row.cat}</strong></td>
                <td>${row.currentPct.toFixed(1)}%</td>
                <td>
                    <input class="table-input target-input" type="number" min="0" max="100" step="0.1" data-cat="${row.cat}" value="${row.target}" ${targetsEditMode && targetEditPolicy.canEdit ? "" : "disabled"}>
                </td>
                <td>
                    <input class="table-input monthly-input" type="number" min="0" step="1" data-cat="${row.cat}" value="${row.monthly}" ${targetsEditMode ? "" : "disabled"}>
                    <div class="target-hint">Base: ${formatCurrency(row.baseMonthly)} · Final: ${formatCurrency(row.monthly)}</div>
                </td>
                <td>
                    <div class="allocation-compare">
                        <div class="allocation-range">
                            <span class="allocation-range-mid"></span>
                            <span class="allocation-range-fill ${combinedClass}" style="left:${rangeStart}%; width:${normalizedRange}%;"></span>
                        </div>
                        <span class="allocation-diff ${combinedClass}">${actionLabel} ${row.adjustmentPp >= 0 ? "+" : ""}${row.adjustmentPp.toFixed(1)}pp</span>
                        <div class="target-hint">Recomendado: ${formatCurrency(row.suggestedMonthly)} (${row.adjustmentAmount >= 0 ? "+" : ""}${formatCurrency(row.adjustmentAmount)})</div>
                    </div>
                </td>
            </tr>
        `;
        })
        .join("");

    if (monthlyTotalEl) monthlyTotalEl.textContent = formatCurrency(monthlyTotal);

    setupTableEvents(tbody, targetEditPolicy);
}

/**
 * Sets up events for the targets table inputs.
 */
function setupTableEvents(tbody, targetEditPolicy) {
    tbody.querySelectorAll(".target-input").forEach((input) => {
        input.addEventListener("change", (e) => {
            if (!targetsEditMode || !targetEditPolicy.canEdit) {
                showToast(!targetsEditMode ? "Pulsa el lápiz para editar objetivos" : targetEditPolicy.lockMessage, "error");
                updateTargetsTable();
                return;
            }
            const cat = e.target.dataset.cat;
            const value = Number.parseFloat(e.target.value) || 0;
            targetsDraft[cat] = {
                ...(targetsDraft[cat] || {}),
                target: Math.max(0, Math.min(100, value)),
            };
            updateTargetsTable();
        });
    });

    tbody.querySelectorAll(".monthly-input").forEach((input) => {
        input.addEventListener("change", (e) => {
            if (!targetsEditMode) {
                showToast("Pulsa el lápiz para editar objetivos", "error");
                updateTargetsTable();
                return;
            }
            const cat = e.target.dataset.cat;
            const value = Number.parseFloat(e.target.value) || 0;
            targetsDraft[cat] = {
                ...(targetsDraft[cat] || {}),
                monthly: Math.max(0, value),
            };
            updateTargetsTable();
        });
    });
}
