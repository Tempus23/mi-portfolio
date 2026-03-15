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
 * Shows a confirmation modal and returns a Promise.
 */
export function showConfirmModal({ title, message, icon = '?', confirmText = 'Confirmar', cancelText = 'Cancelar' }) {
    const modal = $('modal');
    const mTitle = $('modalTitle');
    const mMessage = $('modalMessage');
    const mConfirm = $('modalConfirm');
    const mCancel = $('modalCancel');
    const mIcon = $('modalIcon');

    if (!modal || !mTitle || !mMessage || !mConfirm || !mCancel) return Promise.resolve(false);

    mTitle.textContent = title;
    mMessage.innerHTML = message; // Use innerHTML for rich content
    mConfirm.textContent = confirmText;
    mCancel.textContent = cancelText;
    if (mIcon) mIcon.textContent = icon;

    if (mIcon) mIcon.textContent = icon;
    
    if (arguments[0].wide) {
        modal.classList.add('wide');
    } else {
        modal.classList.remove('wide');
    }

    modal.classList.add('show');

    return new Promise((resolve) => {
        const onConfirm = () => {
            modal.classList.remove('show');
            cleanup();
            resolve(true);
        };
        const onCancel = () => {
            modal.classList.remove('show');
            cleanup();
            resolve(false);
        };
        const cleanup = () => {
            mConfirm.removeEventListener('click', onConfirm);
            mCancel.removeEventListener('click', onCancel);
        };

        mConfirm.addEventListener('click', onConfirm);
        mCancel.addEventListener('click', onCancel);
    });
}

/**
 * Safely attaches an event listener to an element by ID.
 */
export function on(id, event, callback) {
    const el = $(id);
    if (el) el.addEventListener(event, callback);
}
