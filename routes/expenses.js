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
import { parseListMonthQuery, buildIssueDateMonthFilter } from '../utils/listMonthFilter.js';
import { getBusinessTimezone, parseSummaryPeriodQuery } from '../utils/timezone.js';
import { getExpenseSummaryForUser } from '../utils/expenseAnalytics.js';

const router = express.Router();

router.get('/summary', auth, asyncHandler(async (req, res) => {
    const timeZone = await getBusinessTimezone(req.user.userId);
    const { year, month } = parseSummaryPeriodQuery(req.query, timeZone);
    const summary = await getExpenseSummaryForUser(req.user.userId, { year, month, timeZone });
    res.json(summary);
}));

router.get('/', auth, asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const { page, limit, skip } = parsePagination(req);
    const filter = { userId };
    const searchFilter = buildSearchFilter(req.query.search, ['description', 'vendor']);
    if (searchFilter) Object.assign(filter, searchFilter);

    const listMonth = parseListMonthQuery(req.query);
    const dateFilter = listMonth ? buildIssueDateMonthFilter(listMonth.year, listMonth.month) : null;
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
