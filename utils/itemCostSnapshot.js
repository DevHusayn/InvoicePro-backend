import mongoose from 'mongoose';
import Product from '../models/Product.js';

function roundMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

/**
 * Attach unitCost snapshots from the product catalog to line items with productId.
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {Array<object>|undefined} items
 */
export async function snapshotItemUnitCosts(userId, items) {
    if (!Array.isArray(items) || items.length === 0) return items;

    const productIds = [
        ...new Set(
            items
                .map((item) => item?.productId)
                .filter(Boolean)
                .map(String)
        ),
    ];

    if (productIds.length === 0) return items;

    const products = await Product.find({
        userId,
        _id: { $in: productIds.map((id) => new mongoose.Types.ObjectId(id)) },
    })
        .select('unitCost')
        .lean();

    const costById = new Map(
        products.map((product) => [String(product._id), roundMoney(product.unitCost)])
    );

    return items.map((item) => {
        if (!item?.productId) return item;
        const unitCost = costById.get(String(item.productId));
        return {
            ...item,
            unitCost: unitCost ?? 0,
        };
    });
}

/**
 * Weighted-average unit cost after receiving stock from a purchase order.
 */
export function computeWeightedAverageCost(oldQty, oldCost, receivedQty, poRate) {
    const previousQty = Number(oldQty) || 0;
    const previousCost = Number(oldCost) || 0;
    const delta = Number(receivedQty) || 0;
    const incomingRate = Number(poRate) || 0;

    if (delta <= 0) return previousCost;
    if (previousQty <= 0) return roundMoney(incomingRate);

    const totalValue = previousQty * previousCost + delta * incomingRate;
    const totalQty = previousQty + delta;
    return roundMoney(totalValue / totalQty);
}
