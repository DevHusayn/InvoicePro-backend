import express from 'express';
import Client from '../models/Client.js';
import auth from '../middleware/auth.js';
import validateObjectId from '../middleware/validateObjectId.js';
import { sanitizeClientPayload, sanitizeClientUpdates } from '../utils/sanitize.js';
import asyncHandler from '../middleware/asyncHandler.js';
import {
    parsePagination,
    paginateFind,
    buildPaginationMeta,
    buildSearchFilter,
} from '../utils/pagination.js';
import { countListSummary, buildSummaryResponse, resolveListSummaryOptions } from '../utils/listSummary.js';

const router = express.Router();

router.get('/', auth, asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const { page, limit, skip } = parsePagination(req);
    const filter = { userId };
    const searchFilter = buildSearchFilter(req.query.search, [
        'name',
        'email',
        'company',
        'phone',
    ]);
    if (searchFilter) Object.assign(filter, searchFilter);

    const [{ data, total }, summaryCounts] = await Promise.all([
        paginateFind(Client, filter, {
            skip,
            limit,
            sort: { name: 1 },
            lean: true,
        }),
        (async () => {
            const summaryOpts = await resolveListSummaryOptions(req, userId);
            const counts = await countListSummary(Client, { userId }, summaryOpts);
            return counts;
        })(),
    ]);

    res.json({
        data,
        pagination: buildPaginationMeta(page, limit, total),
        summary: buildSummaryResponse('totalClients', summaryCounts.total, summaryCounts),
    });
}));

router.post('/', auth, asyncHandler(async (req, res) => {
    const payload = sanitizeClientPayload(req.body);
    const client = await Client.create({ ...payload, userId: req.user.userId });
    res.status(201).json(client);
}));

router.get('/:id', auth, validateObjectId(), asyncHandler(async (req, res) => {
    const client = await Client.findOne({
        _id: req.params.id,
        userId: req.user.userId,
    }).lean();
    if (!client) return res.status(404).json({ message: 'Client not found' });
    res.json(client);
}));

router.put('/:id', auth, validateObjectId(), asyncHandler(async (req, res) => {
    const updates = sanitizeClientUpdates(req.body);
    const client = await Client.findOneAndUpdate(
        { _id: req.params.id, userId: req.user.userId },
        updates,
        { new: true }
    );
    if (!client) return res.status(404).json({ message: 'Client not found' });
    res.json(client);
}));

router.delete('/:id', auth, validateObjectId(), asyncHandler(async (req, res) => {
    const client = await Client.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!client) return res.status(404).json({ message: 'Client not found' });
    res.json({ message: 'Client deleted' });
}));

export default router;
