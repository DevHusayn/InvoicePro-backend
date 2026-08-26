function roundMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

/**
 * Suggest a selling price that preserves the catalog margin (or markup when margin is unavailable).
 */
export function suggestUnitPricePreservingMargin(previousUnitPrice, previousUnitCost, referenceCost) {
    const price = Number(previousUnitPrice) || 0;
    const oldCost = Number(previousUnitCost) || 0;
    const newCost = Number(referenceCost) || 0;

    if (price <= 0 || newCost <= 0) return null;

    if (oldCost > 0 && price > oldCost) {
        const margin = (price - oldCost) / price;
        if (margin > 0 && margin < 1) {
            return roundMoney(newCost / (1 - margin));
        }
        const markup = (price - oldCost) / oldCost;
        return roundMoney(newCost * (1 + markup));
    }

    if (oldCost <= 0 && price > 0) {
        return roundMoney(price);
    }

    return null;
}

/**
 * Build selling-price review prompts after PO stock is received.
 * @param {Map<string, { name: string, previousUnitCost: number, previousUnitPrice: number }>} snapshots
 * @param {Array<{ productId: string|import('mongoose').Types.ObjectId, delta: number, poRate: number, newUnitCost: number }>} receiveResults
 */
export function buildSellingPricePrompts(snapshots, receiveResults) {
    if (!snapshots?.size || !Array.isArray(receiveResults) || receiveResults.length === 0) {
        return [];
    }

    const aggregated = new Map();

    for (const result of receiveResults) {
        const productId = String(result.productId);
        if (!snapshots.has(productId)) continue;

        const delta = Number(result.delta) || 0;
        const poRate = roundMoney(result.poRate);
        const entry = aggregated.get(productId) || {
            productId,
            totalDelta: 0,
            weightedRateSum: 0,
            newUnitCost: roundMoney(result.newUnitCost),
        };

        entry.totalDelta += delta;
        entry.weightedRateSum += delta * poRate;
        entry.newUnitCost = roundMoney(result.newUnitCost);
        aggregated.set(productId, entry);
    }

    const prompts = [];

    for (const [productId, entry] of aggregated) {
        const snap = snapshots.get(productId);
        const previousUnitCost = roundMoney(snap.previousUnitCost);
        const previousUnitPrice = roundMoney(snap.previousUnitPrice);
        const newUnitCost = entry.newUnitCost;
        const poLineRate =
            entry.totalDelta > 0
                ? roundMoney(entry.weightedRateSum / entry.totalDelta)
                : roundMoney(entry.weightedRateSum);

        const poRateDiffersFromSavedCost = poLineRate !== previousUnitCost;
        const catalogCostChanged = newUnitCost !== previousUnitCost;

        if (!poRateDiffersFromSavedCost && !catalogCostChanged) continue;

        const referenceCost = catalogCostChanged ? newUnitCost : poLineRate;
        const suggestedUnitPrice = suggestUnitPricePreservingMargin(
            previousUnitPrice,
            previousUnitCost,
            referenceCost
        );

        prompts.push({
            productId,
            productName: snap.name,
            previousUnitCost,
            newUnitCost,
            poLineRate,
            previousUnitPrice,
            suggestedUnitPrice,
            poRateDiffersFromSavedCost,
            catalogCostChanged,
        });
    }

    return prompts.sort((a, b) => a.productName.localeCompare(b.productName));
}
