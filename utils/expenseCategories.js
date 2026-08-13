export const EXPENSE_CATEGORY_IDS = [
    'rent',
    'salaries',
    'transport',
    'utilities',
    'marketing',
    'supplies',
];

export const EXPENSE_CATEGORIES = [
    { id: 'rent', label: 'Rent' },
    { id: 'salaries', label: 'Salaries' },
    { id: 'transport', label: 'Transport' },
    { id: 'utilities', label: 'Utilities' },
    { id: 'marketing', label: 'Marketing' },
    { id: 'supplies', label: 'Supplies' },
];

const LEGACY_CATEGORY_LABELS = {
    other: 'Other',
};

export function isPresetExpenseCategory(value) {
    return EXPENSE_CATEGORY_IDS.includes(value);
}

export function isValidExpenseCategory(value) {
    return isPresetExpenseCategory(value);
}

export function getExpenseCategoryLabel(categoryId) {
    return (
        EXPENSE_CATEGORIES.find((entry) => entry.id === categoryId)?.label ??
        LEGACY_CATEGORY_LABELS[categoryId] ??
        categoryId
    );
}
