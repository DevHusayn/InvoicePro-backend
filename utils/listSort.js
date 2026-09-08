export const CATALOG_LIST_SORT = {
    newest: { createdAt: -1, _id: -1 },
    oldest: { createdAt: 1, _id: 1 },
    nameAsc: { name: 1, _id: 1 },
    nameDesc: { name: -1, _id: -1 },
};

export const PRODUCT_LIST_SORT = {
    ...CATALOG_LIST_SORT,
    priceHigh: { unitPrice: -1, _id: -1 },
    priceLow: { unitPrice: 1, _id: 1 },
};

export const EXPENSE_LIST_SORT = {
    newest: { date: -1, createdAt: -1 },
    oldest: { date: 1, createdAt: 1 },
    amountHigh: { amount: -1, date: -1 },
    amountLow: { amount: 1, date: -1 },
};

/** Case-insensitive A–Z (so "kalr" sorts with K, not after Z). */
export const NAME_SORT_COLLATION = { locale: 'en', strength: 2 };

const NAME_SORT_KEYS = new Set(['nameAsc', 'nameDesc']);

export function resolveListSort(querySort, sortMap, fallbackKey = 'newest') {
    const requested = String(querySort || fallbackKey).trim();
    const key = sortMap[requested] ? requested : fallbackKey;
    return {
        sort: sortMap[key] || sortMap[fallbackKey],
        collation: NAME_SORT_KEYS.has(key) ? NAME_SORT_COLLATION : undefined,
    };
}
