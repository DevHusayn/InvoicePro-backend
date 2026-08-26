import mongoose from 'mongoose';
import Product from '../models/Product.js';
import StockMovement from '../models/StockMovement.js';
import { buildSearchFilter, paginateFind, buildPaginationMeta } from './pagination.js';

const TRACKED_FILTER = { trackInventory: true };

function toObjectId(userId) {
    return userId instanceof mongoose.Types.ObjectId
        ? userId
        : new mongoose.Types.ObjectId(String(userId));
}

function lowStockExpr() {
    return {
        $and: [
            { $gt: ['$quantityOnHand', 0] },
            { $ne: ['$lowStockThreshold', null] },
            { $lte: ['$quantityOnHand', '$lowStockThreshold'] },
        ],
    };
}

function inStockExpr() {
    return {
        $and: [
            { $gt: ['$quantityOnHand', 0] },
            {
                $or: [
                    { $eq: ['$lowStockThreshold', null] },
                    { $gt: ['$quantityOnHand', '$lowStockThreshold'] },
                ],
            },
        ],
    };
}

/** Classify a tracked product's stock health for tests and UI helpers. */
export function classifyStockStatus(product) {
    if (!product?.trackInventory) return null;
    const qty = Number(product.quantityOnHand ?? 0);
    if (qty <= 0) return 'out_of_stock';
    const threshold = product.lowStockThreshold;
    if (threshold != null && qty <= Number(threshold)) return 'low_stock';
    return 'in_stock';
}

/** Pure summary rollup for unit tests. */
export function computeInventorySummaryFromProducts(products = []) {
    const tracked = products.filter((product) => product?.trackInventory);
    let totalUnitsOnHand = 0;
    let totalStockValue = 0;
    let totalPotentialSalesValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    for (const product of tracked) {
        const qty = Number(product.quantityOnHand ?? 0);
        const cost = Number(product.unitCost ?? 0);
        const price = Number(product.unitPrice ?? 0);
        totalUnitsOnHand += qty;
        totalStockValue += qty * cost;
        totalPotentialSalesValue += qty * price;
        const status = classifyStockStatus(product);
        if (status === 'low_stock') lowStockCount += 1;
        if (status === 'out_of_stock') outOfStockCount += 1;
    }

    return {
        trackedProducts: tracked.length,
        totalUnitsOnHand,
        totalStockValue,
        totalPotentialSalesValue,
        lowStockCount,
        outOfStockCount,
    };
}

export function buildInventoryStockStatusFilter(status) {
    const key = String(status || 'all').trim().toLowerCase();
    if (key === 'in_stock') {
        return { $expr: inStockExpr() };
    }
    if (key === 'low_stock') {
        return { $expr: lowStockExpr() };
    }
    if (key === 'out_of_stock') {
        return { quantityOnHand: { $lte: 0 } };
    }
    return {};
}

function buildTrackedProductFilter(userId, { search } = {}) {
    const filter = { userId: toObjectId(userId), ...TRACKED_FILTER };
    const searchFilter = buildSearchFilter(search, ['name', 'description']);
    if (searchFilter) Object.assign(filter, searchFilter);
    return filter;
}

export async function getInventorySummary(userId) {
    const uid = toObjectId(userId);
    const base = { userId: uid, ...TRACKED_FILTER };

    const [agg, lowStockCount, outOfStockCount] = await Promise.all([
        Product.aggregate([
            { $match: base },
            {
                $group: {
                    _id: null,
                    trackedProducts: { $sum: 1 },
                    totalUnitsOnHand: { $sum: '$quantityOnHand' },
                    totalStockValue: {
                        $sum: {
                            $multiply: ['$quantityOnHand', { $ifNull: ['$unitCost', 0] }],
                        },
                    },
                    totalPotentialSalesValue: {
                        $sum: {
                            $multiply: ['$quantityOnHand', { $ifNull: ['$unitPrice', 0] }],
                        },
                    },
                },
            },
        ]),
        Product.countDocuments({ ...base, $expr: lowStockExpr() }),
        Product.countDocuments({ ...base, quantityOnHand: { $lte: 0 } }),
    ]);

    const row = agg[0];
    return {
        trackedProducts: row?.trackedProducts ?? 0,
        totalUnitsOnHand: row?.totalUnitsOnHand ?? 0,
        totalStockValue: row?.totalStockValue ?? 0,
        totalPotentialSalesValue: row?.totalPotentialSalesValue ?? 0,
        lowStockCount,
        outOfStockCount,
    };
}

export async function getInventoryStockStatusCounts(userId, { search } = {}) {
    const base = buildTrackedProductFilter(userId, { search });
    const [all, inStock, lowStock, outOfStock] = await Promise.all([
        Product.countDocuments(base),
        Product.countDocuments({ ...base, $expr: inStockExpr() }),
        Product.countDocuments({ ...base, $expr: lowStockExpr() }),
        Product.countDocuments({ ...base, quantityOnHand: { $lte: 0 } }),
    ]);

    return {
        all,
        in_stock: inStock,
        low_stock: lowStock,
        out_of_stock: outOfStock,
    };
}

export async function listInventoryStock(userId, { page, limit, skip, search, status }) {
    const filter = buildTrackedProductFilter(userId, { search });
    const statusFilter = buildInventoryStockStatusFilter(status);
    Object.assign(filter, statusFilter);

    const [{ data, total }, statusCounts] = await Promise.all([
        paginateFind(Product, filter, {
            skip,
            limit,
            sort: { name: 1 },
            select: 'name quantityOnHand unitCost lowStockThreshold trackInventory',
            lean: true,
        }),
        getInventoryStockStatusCounts(userId, { search }),
    ]);

    return {
        data,
        pagination: buildPaginationMeta(page, limit, total),
        statusCounts,
    };
}

async function resolveMovementProductIds(userId, search) {
    const q = String(search || '').trim();
    if (!q) return null;
    const searchFilter = buildSearchFilter(q, ['name']);
    if (!searchFilter) return null;

    const products = await Product.find({ userId: toObjectId(userId), ...searchFilter })
        .select('_id')
        .lean();
    return products.map((entry) => entry._id);
}

function mapMovementRow(row) {
    return {
        id: String(row._id),
        productId: row.productId ? String(row.productId) : null,
        productName: row.productName || '',
        delta: row.delta,
        balanceAfter: row.balanceAfter,
        source: row.source,
        action: row.action,
        documentId: row.documentId ? String(row.documentId) : null,
        documentNumber: row.documentNumber || null,
        note: row.note || '',
        date: row.createdAt?.toISOString?.() || null,
    };
}

export async function listInventoryMovements(
    userId,
    { page, limit, skip, search, dateFilter = null }
) {
    const uid = toObjectId(userId);
    const filter = { userId: uid };
    if (dateFilter) Object.assign(filter, dateFilter);

    const productIds = await resolveMovementProductIds(userId, search);
    if (productIds) {
        if (productIds.length === 0) {
            return {
                data: [],
                pagination: buildPaginationMeta(page, limit, 0),
            };
        }
        filter.productId = { $in: productIds };
    }

    const [total, rows] = await Promise.all([
        StockMovement.countDocuments(filter),
        StockMovement.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
    ]);

    const uniqueProductIds = [...new Set(rows.map((row) => String(row.productId)).filter(Boolean))];
    const products = uniqueProductIds.length
        ? await Product.find({ userId: uid, _id: { $in: uniqueProductIds } })
              .select('name')
              .lean()
        : [];
    const nameById = new Map(products.map((product) => [String(product._id), product.name || '']));

    const data = rows.map((row) =>
        mapMovementRow({
            ...row,
            productName: nameById.get(String(row.productId)) || '',
        })
    );

    return {
        data,
        pagination: buildPaginationMeta(page, limit, total),
    };
}
