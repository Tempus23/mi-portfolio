export function formatCurrency(value, options = {}) {
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR',
        ...options
    }).format(value);
}
