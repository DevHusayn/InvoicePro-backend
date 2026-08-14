import express from 'express';
import Expense from '../models/Expense.js';
import auth from '../middleware/auth.js';
import validateObjectId from '../middleware/validateObjectId.js';
import asyncHandler from '../middleware/asyncHandler.js';
import {
    sanitizeExpensePayload,
    sanitizeExpenseUpdates,
} from '../utils/sanitize.js';
import {
    parsePagination,
    paginateFind,
    buildPaginationMeta,
    buildSearchFilter,
} from '../utils/pagination.js';
import { getListPeriodMongoFilter } from '../utils/listMonthFilter.js';
import { getBusinessTimezone, resolveAnalyticsPeriod } from '../utils/timezone.js';
import { getExpenseSummaryForUser } from '../utils/expenseAnalytics.js';

const router = express.Router();

router.get('/summary', auth, asyncHandler(async (req, res) => {
    const timeZone = await getBusinessTimezone(req.user.userId);
    const period = resolveAnalyticsPeriod(req.query, timeZone);
    const summary = await getExpenseSummaryForUser(req.user.userId, { period, timeZone });
    res.json(summary);
}));

router.get('/', auth, asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const { page, limit, skip } = parsePagination(req);
    const filter = { userId };
    const searchFilter = buildSearchFilter(req.query.search, ['description', 'vendor']);
    if (searchFilter) Object.assign(filter, searchFilter);

    const dateFilter = await getListPeriodMongoFilter(req.query, userId);
    if (dateFilter) Object.assign(filter, dateFilter);

    const { data, total } = await paginateFind(Expense, filter, {
        skip,
        limit,
        sort: { date: -1, createdAt: -1 },
        lean: true,
    });

    res.json({
        data,
        pagination: buildPaginationMeta(page, limit, total),
    });
}));

router.post('/', auth, asyncHandler(async (req, res) => {
    const payload = sanitizeExpensePayload(req.body);
    const expense = await Expense.create({ ...payload, userId: req.user.userId });
    res.status(201).json(expense);
}));

router.get('/:id', auth, validateObjectId(), asyncHandler(async (req, res) => {
    const expense = await Expense.findOne({
        _id: req.params.id,
        userId: req.user.userId,
    }).lean();
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    res.json(expense);
}));

router.put('/:id', auth, validateObjectId(), asyncHandler(async (req, res) => {
    const updates = sanitizeExpenseUpdates(req.body);
    const expense = await Expense.findOneAndUpdate(
        { _id: req.params.id, userId: req.user.userId },
        updates,
        { new: true }
    );
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    res.json(expense);
}));

router.delete('/:id', auth, validateObjectId(), asyncHandler(async (req, res) => {
    const expense = await Expense.findOneAndDelete({
        _id: req.params.id,
        userId: req.user.userId,
    });
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    res.json({ message: 'Expense deleted' });
}));

export default router;
