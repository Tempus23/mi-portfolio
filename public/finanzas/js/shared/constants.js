export const STORAGE_KEYS = {
    SNAPSHOTS: 'portfolio_snapshots',
    TARGETS: 'portfolio_targets',
    TARGETS_META: 'portfolio_targets_meta',
    HOLDINGS_CHANGES: 'portfolio_holdings_changes',
    SELECTED_CATEGORY: 'portfolio_selected_category'
};
export const SELECTED_CATEGORY_KEY = STORAGE_KEYS.SELECTED_CATEGORY;

// Target Management Constants
export const TARGET_EDIT_LOCK_MONTHS = 1;      // Months to wait before re-editing a specific target
export const TARGET_EDIT_WINDOW_HOURS = 24;    // Window to edit a target without locking
export const TARGET_ADJUSTMENT_HARDNESS_DEFAULT = 50; // Default hardness for budget distribution

export const AssetIndex = {
    NAME: 0,
    TERM: 1,
    CATEGORY: 2,
    PURCHASE_PRICE: 3,
    QUANTITY: 4,
    CURRENT_PRICE: 5,
    PURCHASE_VALUE: 6,
    CURRENT_VALUE: 7
};

export const CATEGORY_COLORS = {
    'Criptomonedas': '#ff9f0a',
    'Cash': '#32d74b',
    'Gold': '#ffd60a',
    'P2P': '#bf5af2',
    'Acciones': '#0071e3',
    'Private Equity': '#ff375f'
};

export const TERM_COLORS = {
    'Largo': '#0071e3',
    'Medio': '#ff9f0a',
    'Corto': '#32d74b'
};
