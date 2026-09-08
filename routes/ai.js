/**
 * v1 AI surface: POST /draft-document only.
 * Do not add chat, OCR, auto-send, reminder drafts, dashboard insights,
 * or a general assistant until this endpoint is used in production.
 */
import express from 'express';
import { isAiDraftsEnabled } from '../utils/aiDraftsEnabled.js';
import auth from '../middleware/auth.js';
import requireEmailVerified from '../middleware/requireEmailVerified.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { aiDraftLimiter } from '../middleware/rateLimits.js';
import { isUserPremium } from '../utils/premiumAccess.js';
import { getBusinessTimezone } from '../utils/timezone.js';
import { completeJson } from '../utils/aiService.js';
import { assertAndReserveAiDraft, recordAiTokenUsage } from '../utils/aiUsage.js';
import {
    buildAiDraftFromModelOutput,
    buildAiDraftMessages,
    normalizeAiDocumentType,
    normalizeAiPrompt,
    parseModelJson,
    sliceCatalog,
} from '../utils/aiDraftDocument.js';
import Client from '../models/Client.js';
import Product from '../models/Product.js';
import BusinessInfo from '../models/CompanyInfo.js';
import { NAME_SORT_COLLATION } from '../utils/listSort.js';

const router = express.Router();

router.use((req, res, next) => {
    if (!isAiDraftsEnabled()) {
        return res.status(404).json({ message: 'Not found' });
    }
    next();
});

router.post(
    '/draft-document',
    aiDraftLimiter,
    auth,
    requireEmailVerified,
    asyncHandler(async (req, res) => {
        const userId = req.user.userId;
        if (!(await isUserPremium(userId))) {
            return res.status(403).json({
                message: 'AI drafting is available on Premium.',
                code: 'PREMIUM_REQUIRED',
            });
        }

        const prompt = normalizeAiPrompt(req.body?.prompt);
        const documentType = normalizeAiDocumentType(req.body?.documentType);
        const timeZone = await getBusinessTimezone(userId);
        await assertAndReserveAiDraft(userId, timeZone);

        const [clients, products, businessInfo] = await Promise.all([
            Client.find({ userId }).select('name company email phone address').collation(NAME_SORT_COLLATION).sort({ name: 1 }).limit(80).lean(),
            Product.find({ userId })
                .select('name unitPrice trackInventory quantityOnHand')
                .collation(NAME_SORT_COLLATION)
                .sort({ name: 1 })
                .limit(80)
                .lean(),
            BusinessInfo.findOne({ userId }).select('name defaultCurrency').lean(),
        ]);

        const catalog = sliceCatalog({ clients, products });
        const messages = buildAiDraftMessages({
            prompt,
            documentType,
            catalog,
            businessName: businessInfo?.name,
            currency: businessInfo?.defaultCurrency || 'NGN',
        });

        const completion = await completeJson(messages);
        await recordAiTokenUsage(userId, timeZone, completion.usage);

        const parsed = parseModelJson(completion.text);
        const draft = buildAiDraftFromModelOutput({
            parsed,
            prompt,
            documentType,
            catalog,
            sourceClients: clients,
        });

        res.json(draft);
    })
);

export default router;
