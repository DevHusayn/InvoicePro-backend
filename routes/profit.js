import express from 'express';
import auth from '../middleware/auth.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { getProfitSummaryForUser } from '../utils/profitAnalytics.js';
import { getBusinessTimezone, resolveAnalyticsPeriod } from '../utils/timezone.js';
import BusinessInfo from '../models/CompanyInfo.js';
import { isPremiumActive } from '../utils/businessInfoHelpers.js';

const router = express.Router();

router.get('/summary', auth, asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const businessInfo = await BusinessInfo.findOne({ userId }).lean();

    if (!isPremiumActive(businessInfo)) {
        return res.status(403).json({
            message: 'Profit analytics are available on Premium.',
            code: 'PREMIUM_REQUIRED',
        });
    }

    const timeZone = await getBusinessTimezone(userId);
    const period = resolveAnalyticsPeriod(req.query, timeZone);
    const summary = await getProfitSummaryForUser(userId, { period, timeZone });
    res.json(summary);
}));

export default router;
