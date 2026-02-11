export function showToast(message, type = 'success', options = {}) {
    const { timeout = 3000, targetId = 'toast' } = options;
    const toast = document.getElementById(targetId);
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast ${type} show`;

    window.setTimeout(() => {
        toast.classList.remove('show');
    }, timeout);
}
