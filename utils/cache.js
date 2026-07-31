/** Lightweight in-memory TTL cache for hot read paths (dashboard stats, etc.). */

const stores = new Map();

function getStore(namespace) {
    if (!stores.has(namespace)) {
        stores.set(namespace, new Map());
    }
    return stores.get(namespace);
}

export function getCache(namespace, key) {
    const store = getStore(namespace);
    const entry = store.get(String(key));
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        store.delete(String(key));
        return null;
    }
    return entry.value;
}

export function setCache(namespace, key, value, ttlMs) {
    const store = getStore(namespace);
    store.set(String(key), {
        value,
        expiresAt: Date.now() + ttlMs,
    });
}

export function invalidateCache(namespace, key) {
    const store = getStore(namespace);
    if (key === undefined) {
        store.clear();
        return;
    }
    store.delete(String(key));
}
