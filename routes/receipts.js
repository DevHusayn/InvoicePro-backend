import express from 'express';
import Invoice from '../models/Invoice.js';
import Client from '../models/Client.js';
import auth from '../middleware/auth.js';
import requireEmailVerified from '../middleware/requireEmailVerified.js';
import validateObjectId from '../middleware/validateObjectId.js';
import {
    reserveInvoiceCreation,
    releaseInvoiceCreation,
} from '../utils/invoiceLimits.js';
import { getNextReceiptNumber } from '../utils/receiptNumber.js';
import {
    normalizeReceiptPayload,
    assignReceiptNumbers,
    isFinalizingReceiptDraft,
    isDraftStatus,
    assertReceiptDeleteAllowed,
    applyReceiptPaymentLedger,
    resolveReceiptPaymentAmount,
    isReceiptDocument,
    applyReceiptPayment,
} from '../utils/receiptValidation.js';
import { RECEIPT_ONLY_FILTER } from '../utils/invoiceDocumentFilter.js';
import { attachPublicTokenIfNeeded, ensureInvoicePublicToken } from '../utils/invoicePublicToken.js';
import {
    sendReceiptEmail,
    getEmailErrorMessage,
    notifyOwnerInvoiceReceiptSent,
} from '../src/emails/index.js';
import {
    loadInvoiceEmailContext,
    buildReceiptUrl,
    formatPaymentMethod,
} from '../src/emails/helpers/invoiceContext.js';
import { getInvoiceAmountPaid } from '../utils/invoicePayments.js';
import asyncHandler from '../middleware/asyncHandler.js';
import mongoose from 'mongoose';
import {
    parsePagination,
    paginateFind,
    buildPaginationMeta,
    buildSearchFilter,
    escapeRegex,
} from '../utils/pagination.js';

const router = express.Router();

const PAID = 'paid';

const RECEIPT_SORT = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    amountHigh: { total: -1 },
    amountLow: { total: 1 },
};

const numberGenerators = {
    getNextReceiptNumber,
};

function toUserObjectId(userId) {
    if (userId instanceof mongoose.Types.ObjectId) return userId;
    return new mongoose.Types.ObjectId(String(userId));
}

function assertReceiptRecord(doc) {
    if (!doc || !isReceiptDocument(doc)) {
        const err = new Error('Receipt not found');
        err.status = 404;
        throw err;
    }
}

async function attachClientNames(receipts, userId) {
    const clientIds = [
        ...new Set(
            receipts
                .map((r) => r.clientId)
                .filter(Boolean)
                .map((id) => String(id))
        ),
    ];
    if (clientIds.length === 0) {
        return receipts.map((r) => ({ ...r, clientName: null, clientCompany: null }));
    }
    const clients = await Client.find({
        userId,
        _id: { $in: clientIds },
    })
        .select('name company')
        .lean();
    const byId = new Map(clients.map((c) => [String(c._id), c]));
    return receipts.map((r) => {
        const client = r.clientId ? byId.get(String(r.clientId)) : null;
        return {
            ...r,
            clientName: client?.name || null,
            clientCompany: client?.company || null,
        };
    });
}

async function resolveSearchClientIds(userId, search) {
    const q = String(search || '').trim();
    if (!q) return [];
    const regex = new RegExp(escapeRegex(q), 'i');
    const clients = await Client.find({
        userId,
        $or: [{ name: regex }, { company: regex }, { email: regex }],
    })
        .select('_id')
        .lean();
    return clients.map((c) => c._id);
}

router.get('/next-number', auth, async (req, res) => {
    try {
        const receiptNumber = await getNextReceiptNumber(req.user.userId);
        res.json({ receiptNumber });
    } catch (err) {
        res.status(500).json({ message: err.message || 'Could not generate receipt number' });
    }
});

router.get('/', auth, asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const { page, limit, skip } = parsePagination(req);
    const sortKey = String(req.query.sort || 'newest').trim();
    const sort = RECEIPT_SORT[sortKey] || RECEIPT_SORT.newest;
    const search = String(req.query.search || '').trim();

    const filter = { userId, status: PAID, ...RECEIPT_ONLY_FILTER };

    if (search) {
        const clientIds = await resolveSearchClientIds(userId, search);
        const textFilter = buildSearchFilter(search, ['receiptNumber']);
        const or = [...(textFilter?.$or || [])];
        if (clientIds.length > 0) {
            or.push({ clientId: { $in: clientIds } });
        }
        if (or.length > 0) {
            filter.$or = or;
        }
    }

    const { data, total } = await paginateFind(Invoice, filter, {
        skip,
        limit,
        sort,
        select: '-items -notes',
        lean: true,
    });

    const withClients = await attachClientNames(data, userId);
    res.json({
        data: withClients,
        pagination: buildPaginationMeta(page, limit, total),
        statusCounts: { all: total },
    });
}));

router.post('/', auth, requireEmailVerified, async (req, res) => {
    let reserved = false;
    const isDraft = isDraftStatus(req.body?.status);
    try {
        if (!isDraft) {
            await reserveInvoiceCreation(req.user.userId);
            reserved = true;
        }
        const normalized = normalizeReceiptPayload(req.body, { isCreate: true });
        const payload = await assignReceiptNumbers(
            normalized,
            null,
            req.user.userId,
            numberGenerators
        );
        if (payload.status === PAID) {
            const paymentAmount = resolveReceiptPaymentAmount(req.body, payload.total);
            applyReceiptPaymentLedger(payload, { amount: paymentAmount });
            attachPublicTokenIfNeeded(payload);
        }
        const receipt = await Invoice.create({
            ...payload,
            userId: req.user.userId,
        });
        res.status(201).json(receipt);
    } catch (err) {
        if (err.status === 400) {
            return res.status(400).json({ message: err.message });
        }
        if (err.code === 'INVOICE_LIMIT_REACHED') {
            return res.status(403).json({
                message: err.message,
                code: err.code,
                usage: err.usage,
            });
        }
        if (reserved) {
            await releaseInvoiceCreation(req.user.userId);
        }
        res.status(500).json({ message: err.message || 'Could not create receipt' });
    }
});

router.get('/:id', auth, validateObjectId(), asyncHandler(async (req, res) => {
    const receipt = await Invoice.findOne({
        _id: req.params.id,
        userId: req.user.userId,
        ...RECEIPT_ONLY_FILTER,
    });
    if (!receipt) return res.status(404).json({ message: 'Receipt not found' });
    res.json(receipt);
}));

router.put('/:id', auth, requireEmailVerified, validateObjectId(), async (req, res) => {
    let reserved = false;
    try {
        const existing = await Invoice.findOne({
            _id: req.params.id,
            userId: req.user.userId,
            ...RECEIPT_ONLY_FILTER,
        });
        if (!existing) return res.status(404).json({ message: 'Receipt not found' });

        const normalized = normalizeReceiptPayload(req.body, { existing });
        if (isFinalizingReceiptDraft(existing, normalized)) {
            await reserveInvoiceCreation(req.user.userId);
            reserved = true;
        }

        const payload = await assignReceiptNumbers(
            normalized,
            existing,
            req.user.userId,
            numberGenerators
        );

        if (payload.status === PAID) {
            const paymentAmount = resolveReceiptPaymentAmount(req.body, payload.total);
            applyReceiptPaymentLedger(payload, { amount: paymentAmount });
            attachPublicTokenIfNeeded(payload, existing);
        }

        const update = Object.fromEntries(
            Object.entries(payload).filter(([, value]) => value !== undefined)
        );

        const receipt = await Invoice.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.userId, ...RECEIPT_ONLY_FILTER },
            update,
            { new: true }
        );

        res.json(receipt);
    } catch (err) {
        if (reserved) {
            await releaseInvoiceCreation(req.user.userId);
        }
        if (err.status === 400) {
            return res.status(400).json({ message: err.message });
        }
        if (err.code === 'INVOICE_LIMIT_REACHED') {
            return res.status(403).json({
                message: err.message,
                code: err.code,
                usage: err.usage,
            });
        }
        res.status(500).json({ message: err.message || 'Could not update receipt' });
    }
});

router.post('/:id/payments', auth, requireEmailVerified, validateObjectId(), async (req, res) => {
    try {
        const receipt = await Invoice.findOne({
            _id: req.params.id,
            userId: req.user.userId,
            ...RECEIPT_ONLY_FILTER,
        });
        assertReceiptRecord(receipt);
        if (receipt.status !== PAID) {
            return res.status(400).json({ message: 'Payments can only be recorded on issued receipts.' });
        }

        applyReceiptPayment(receipt, req.body);
        await receipt.save();

        res.json(receipt);
    } catch (err) {
        if (err.status === 400) {
            return res.status(400).json({ message: err.message });
        }
        console.error('Record receipt payment error:', err);
        res.status(500).json({ message: err.message || 'Could not record payment' });
    }
});

router.post('/:id/send-receipt', auth, requireEmailVerified, validateObjectId(), async (req, res) => {
    try {
        const receipt = await Invoice.findOne({
            _id: req.params.id,
            userId: req.user.userId,
            ...RECEIPT_ONLY_FILTER,
        });
        assertReceiptRecord(receipt);
        if (receipt.status !== PAID) {
            return res.status(400).json({ message: 'Only issued receipts can be emailed.' });
        }
        if (!receipt.receiptNumber) {
            return res.status(400).json({ message: 'This receipt does not have a receipt number.' });
        }

        await ensureInvoicePublicToken(receipt);
        const ctx = await loadInvoiceEmailContext(receipt, req.user.userId);

        await sendReceiptEmail({
            to: ctx.to,
            customerName: ctx.customerName,
            invoiceNumber: receipt.invoiceNumber || undefined,
            receiptNumber: receipt.receiptNumber,
            amountPaid: getInvoiceAmountPaid(receipt) || receipt.total,
            currency: receipt.currency || 'NGN',
            paymentDate: receipt.datePaid || new Date(),
            paymentMethod: formatPaymentMethod(receipt.paymentMethod),
            businessName: ctx.businessName,
            branding: ctx.branding,
            receiptUrl: buildReceiptUrl(receipt),
        });

        await notifyOwnerInvoiceReceiptSent({
            userId: req.user.userId,
            invoice: receipt,
            clientEmail: ctx.to,
            customerName: ctx.customerName,
        });

        res.json({ message: 'Receipt email sent.', sentTo: ctx.to });
    } catch (err) {
        if (err.status === 400 || err.status === 404) {
            return res.status(err.status).json({ message: err.message });
        }
        console.error('Send receipt email error:', err);
        return res.status(503).json({ message: getEmailErrorMessage(err) });
    }
});

router.delete('/:id', auth, requireEmailVerified, validateObjectId(), async (req, res) => {
    try {
        const existing = await Invoice.findOne({
            _id: req.params.id,
            userId: req.user.userId,
            ...RECEIPT_ONLY_FILTER,
        });
        if (!existing) return res.status(404).json({ message: 'Receipt not found' });
        assertReceiptDeleteAllowed(existing);
        await Invoice.deleteOne({ _id: existing._id });
        res.json({ message: 'Receipt deleted' });
    } catch (err) {
        if (err.status === 400) {
            return res.status(400).json({ message: err.message });
        }
        res.status(500).json({ message: err.message || 'Could not delete receipt' });
    }
});

export default router;
