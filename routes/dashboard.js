import express from 'express';
import auth from '../middleware/auth.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { getFullDashboardForUser, invalidateDashboardCache } from '../utils/dashboardStats.js';

const router = express.Router();

/** Aggregated dashboard — stats, recent docs, alerts, subscription, business info in one response. */
router.get('/', auth, asyncHandler(async (req, res) => {
    const dashboard = await getFullDashboardForUser(req.user.userId);
    res.json(dashboard);
}));

/** Allow clients to bust cache after mutations (optional). */
router.post('/invalidate', auth, asyncHandler(async (req, res) => {
    invalidateDashboardCache(req.user.userId);
    res.json({ ok: true });
}));

export default router;
