import express from 'express';
import Product from '../models/Product.js';
import auth from '../middleware/auth.js';
import validateObjectId from '../middleware/validateObjectId.js';
import asyncHandler from '../middleware/asyncHandler.js';
import {
    parsePagination,
    paginateFind,
    buildPaginationMeta,
    buildSearchFilter,
} from '../utils/pagination.js';
import {
    countListSummary,
    buildSummaryResponse,
    resolveListSummaryOptions,
    isSummaryOnlyRequest,
    shouldFetchListSummary,
} from '../utils/listSummary.js';
import { parseListMonthQuery } from '../utils/listMonthFilter.js';
import { getBusinessTimezone, getUtcRangeForMonthInTimezone } from '../utils/timezone.js';
import { sendProductListExport } from '../utils/productListExport.js';
import { adjustProductStock, getAllowOverselling } from '../utils/inventory.js';
import { getProductActivity } from '../utils/productActivity.js';
import { recordStockMovement } from '../utils/stockLedger.js';

const router = express.Router();

function validationError(message) {
    const err = new Error(message);
    err.status = 400;
    return err;
}

function sanitizeInventoryFields(body, { existing = null } = {}) {
    const fields = {};

    if (body.trackInventory !== undefined) {
        fields.trackInventory = Boolean(body.trackInventory);
    } else if (existing) {
        fields.trackInventory = Boolean(existing.trackInventory);
    } else {
        fields.trackInventory = false;
    }

    if (body.quantityOnHand !== undefined) {
        const quantityOnHand = Number(body.quantityOnHand);
        if (!Number.isFinite(quantityOnHand) || quantityOnHand < 0) {
            throw validationError('Quantity on hand must be zero or greater.');
        }
        fields.quantityOnHand = quantityOnHand;
    } else if (!existing) {
        fields.quantityOnHand = 0;
    }

    if (body.lowStockThreshold !== undefined) {
        if (body.lowStockThreshold === null || body.lowStockThreshold === '') {
            fields.lowStockThreshold = null;
        } else {
            const threshold = Number(body.lowStockThreshold);
            if (!Number.isFinite(threshold) || threshold < 0) {
                throw validationError('Low stock threshold must be zero or greater.');
            }
            fields.lowStockThreshold = threshold;
        }
    }

    if (!fields.trackInventory) {
        fields.lowStockThreshold = null;
    }

    return fields;
}

router.get('/export', auth, asyncHandler(async (req, res) => {
    await sendProductListExport(req, res);
}));

router.get('/', auth, asyncHandler(async (req, res) => {
    const userId = req.user.userId;

    if (isSummaryOnlyRequest(req.query)) {
        const summaryOpts = await resolveListSummaryOptions(req, userId);
        const summaryCounts = await countListSummary(Product, { userId }, summaryOpts);
        return res.json({
            summary: buildSummaryResponse('totalProducts', summaryCounts.total, summaryCounts),
        });
    }

    const { page, limit, skip } = parsePagination(req);
    const filter = { userId };
    const searchFilter = buildSearchFilter(req.query.search, ['name', 'description']);
    if (searchFilter) Object.assign(filter, searchFilter);

    const listMonth = parseListMonthQuery(req.query);
    if (listMonth) {
        const timeZone = await getBusinessTimezone(userId);
        const { start, end } = getUtcRangeForMonthInTimezone(
            listMonth.year,
            listMonth.month,
            timeZone
        );
        filter.createdAt = { $gte: start, $lt: end };
    }

    const includeSummary = shouldFetchListSummary(req.query);
    const summaryOpts = includeSummary ? await resolveListSummaryOptions(req, userId) : null;

    const [{ data, total }, summaryCounts] = await Promise.all([
        paginateFind(Product, filter, {
            skip,
            limit,
            sort: { name: 1 },
            lean: true,
        }),
        includeSummary
            ? countListSummary(Product, { userId }, summaryOpts)
            : Promise.resolve(null),
    ]);

    res.json({
        data,
        pagination: buildPaginationMeta(page, limit, total),
        ...(summaryCounts
            ? { summary: buildSummaryResponse('totalProducts', summaryCounts.total, summaryCounts) }
            : {}),
    });
}));

router.post('/', auth, asyncHandler(async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (!name) {
        return res.status(400).json({ message: 'Product name is required' });
    }

    const inventoryFields = sanitizeInventoryFields(req.body);
    const product = await Product.create({
        userId: req.user.userId,
        name,
        description: String(req.body.description || '').trim(),
        unitPrice: Number(req.body.unitPrice) || 0,
        ...inventoryFields,
    });

    if (product.trackInventory && Number(product.quantityOnHand) > 0) {
        await recordStockMovement({
            userId: req.user.userId,
            productId: product._id,
            delta: product.quantityOnHand,
            balanceAfter: product.quantityOnHand,
            source: 'opening',
            action: 'opening',
        });
    }

    res.status(201).json(product);
}));

router.get('/:id/activity', auth, validateObjectId(), asyncHandler(async (req, res) => {
    const activity = await getProductActivity(req.user.userId, req.params.id);
    if (!activity) return res.status(404).json({ message: 'Product not found' });
    res.json(activity);
}));

router.get('/:id', auth, validateObjectId(), asyncHandler(async (req, res) => {
    const product = await Product.findOne({ _id: req.params.id, userId: req.user.userId }).lean();
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
}));

router.put('/:id', auth, validateObjectId(), asyncHandler(async (req, res) => {
    const existing = await Product.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!existing) return res.status(404).json({ message: 'Product not found' });

    const name = req.body.name !== undefined ? String(req.body.name).trim() : undefined;
    if (name !== undefined && !name) {
        return res.status(400).json({ message: 'Product name is required' });
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (req.body.description !== undefined) updates.description = String(req.body.description).trim();
    if (req.body.unitPrice !== undefined) updates.unitPrice = Number(req.body.unitPrice) || 0;

    Object.assign(
        updates,
        sanitizeInventoryFields(req.body, { existing })
    );

    const previousQty = Number(existing.quantityOnHand ?? 0);
    const nextTracksInventory = updates.trackInventory ?? existing.trackInventory;
    const nextQty = updates.quantityOnHand ?? previousQty;

    const product = await Product.findOneAndUpdate(
        { _id: req.params.id, userId: req.user.userId },
        updates,
        { new: true }
    );

    if (product?.trackInventory && nextTracksInventory) {
        const delta = nextQty - previousQty;
        if (delta !== 0) {
            const justEnabled = !existing.trackInventory && product.trackInventory;
            await recordStockMovement({
                userId: req.user.userId,
                productId: product._id,
                delta,
                balanceAfter: product.quantityOnHand ?? 0,
                source: justEnabled ? 'opening' : 'set',
                action: justEnabled ? 'opening' : 'set',
            });
        }
    }

    res.json(product);
}));

router.post('/:id/adjust-stock', auth, validateObjectId(), asyncHandler(async (req, res) => {
    const delta = Number(req.body.delta);
    if (!Number.isFinite(delta) || delta === 0) {
        return res.status(400).json({ message: 'A non-zero numeric delta is required.' });
    }

    const allowOverselling = await getAllowOverselling(req.user.userId);
    const product = await adjustProductStock(req.user.userId, req.params.id, delta, null, {
        allowOverselling,
    });
    if (!product) {
        return res.status(404).json({ message: 'Product not found or inventory is not tracked.' });
    }

    res.json(product);
}));

router.delete('/:id', auth, validateObjectId(), asyncHandler(async (req, res) => {
    const product = await Product.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted' });
}));

export default router;
