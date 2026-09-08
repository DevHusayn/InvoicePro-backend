import express from 'express';
import Supplier from '../models/Supplier.js';
import auth from '../middleware/auth.js';
import validateObjectId from '../middleware/validateObjectId.js';
import { sanitizeSupplierPayload, sanitizeSupplierUpdates } from '../utils/sanitize.js';
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
import { getListPeriodMongoFilter } from '../utils/listMonthFilter.js';
import { getSupplierActivity } from '../utils/supplierActivity.js';
import { CATALOG_LIST_SORT, resolveListSort } from '../utils/listSort.js';

const router = express.Router();

router.get('/', auth, asyncHandler(async (req, res) => {
    const userId = req.user.userId;

    if (isSummaryOnlyRequest(req.query)) {
        const summaryOpts = await resolveListSummaryOptions(req, userId);
        const summaryCounts = await countListSummary(Supplier, { userId }, summaryOpts);
        return res.json({
            summary: buildSummaryResponse('totalSuppliers', summaryCounts.total, summaryCounts),
        });
    }

    const { page, limit, skip } = parsePagination(req);
    const filter = { userId };
    const searchFilter = buildSearchFilter(req.query.search, [
        'name',
        'email',
        'company',
        'phone',
    ]);
    if (searchFilter) Object.assign(filter, searchFilter);

    const dateFilter = await getListPeriodMongoFilter(req.query, userId, { dateField: 'createdAt' });
    if (dateFilter) Object.assign(filter, dateFilter);

    const includeSummary = shouldFetchListSummary(req.query);
    const summaryOpts = includeSummary ? await resolveListSummaryOptions(req, userId) : null;

    const [{ data, total }, summaryCounts] = await Promise.all([
        paginateFind(Supplier, filter, {
            skip,
            limit,
            ...resolveListSort(req.query.sort, CATALOG_LIST_SORT),
            lean: true,
        }),
        includeSummary
            ? countListSummary(Supplier, { userId }, summaryOpts)
            : Promise.resolve(null),
    ]);

    res.json({
        data,
        pagination: buildPaginationMeta(page, limit, total),
        ...(summaryCounts
            ? { summary: buildSummaryResponse('totalSuppliers', summaryCounts.total, summaryCounts) }
            : {}),
    });
}));

router.post('/', auth, asyncHandler(async (req, res) => {
    const payload = sanitizeSupplierPayload(req.body);
    const supplier = await Supplier.create({ ...payload, userId: req.user.userId });
    res.status(201).json(supplier);
}));

router.get('/:id/activity', auth, validateObjectId(), asyncHandler(async (req, res) => {
    const activity = await getSupplierActivity(req.user.userId, req.params.id);
    if (!activity) return res.status(404).json({ message: 'Supplier not found' });
    res.json(activity);
}));

router.get('/:id', auth, validateObjectId(), asyncHandler(async (req, res) => {
    const supplier = await Supplier.findOne({
        _id: req.params.id,
        userId: req.user.userId,
    }).lean();
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    res.json(supplier);
}));

router.put('/:id', auth, validateObjectId(), asyncHandler(async (req, res) => {
    const updates = sanitizeSupplierUpdates(req.body);
    const supplier = await Supplier.findOneAndUpdate(
        { _id: req.params.id, userId: req.user.userId },
        updates,
        { new: true }
    );
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    res.json(supplier);
}));

router.delete('/:id', auth, validateObjectId(), asyncHandler(async (req, res) => {
    const supplier = await Supplier.findOneAndDelete({
        _id: req.params.id,
        userId: req.user.userId,
    });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    res.json({ message: 'Supplier deleted' });
}));

export default router;
