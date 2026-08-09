import express from 'express';
import auth from '../middleware/auth.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { getFullDashboardForUser, invalidateDashboardCache } from '../utils/dashboardStats.js';
import { getPeriodSummaryWithComparison } from '../utils/dashboardAnalytics.js';
import { getBusinessTimezone, parseSummaryPeriodQuery } from '../utils/timezone.js';

const router = express.Router();

/** Period summary with month-over-month comparison for dashboard stat cards. */
router.get('/period-summary', auth, asyncHandler(async (req, res) => {
    const timeZone = await getBusinessTimezone(req.user.userId);
    const { year, month } = parseSummaryPeriodQuery(req.query, timeZone);
    const summary = await getPeriodSummaryWithComparison(req.user.userId, {
        year,
        month,
        timeZone,
    });
    res.json(summary);
}));

/** Aggregated dashboard — stats, recent docs, alerts, subscription, business info in one response. */
router.get('/', auth, asyncHandler(async (req, res) => {
    const dashboard = await getFullDashboardForUser(req.user.userId, {
        summaryYear: req.query.summaryYear,
        summaryMonth: req.query.summaryMonth,
    });
    res.json(dashboard);
}));

/** Allow clients to bust cache after mutations (optional). */
router.post('/invalidate', auth, asyncHandler(async (req, res) => {
    invalidateDashboardCache(req.user.userId);
    res.json({ ok: true });
}));

export default router;
