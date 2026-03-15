/**
 * UI Shared Utilities
 */

/**
 * Returns a DOM element by ID.
 */
export function $(id) {
    return document.getElementById(id);
}

/**
 * Safely sets text content on a DOM element if it exists.
 */
export function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
}

/**
 * Escapes HTML characters in a string.
 */
export function escapeHtml(value) {
    const text = String(value ?? "");
    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
/**
 * Safely attaches an event listener to an element by ID.
 */
export function on(id, event, callback) {
    const el = $(id);
    if (el) el.addEventListener(event, callback);
}
