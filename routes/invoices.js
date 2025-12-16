import express from 'express';
import Invoice from '../models/Invoice.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Get all invoices for user
router.get('/', auth, async (req, res) => {
    const invoices = await Invoice.find({ userId: req.user.userId });
    res.json(invoices);
});

// Create invoice
router.post('/', auth, async (req, res) => {
    const invoice = await Invoice.create({ ...req.body, userId: req.user.userId });
    res.status(201).json(invoice);
});

// Update invoice
router.put('/:id', auth, async (req, res) => {
    const invoice = await Invoice.findOneAndUpdate(
        { _id: req.params.id, userId: req.user.userId },
        req.body,
        { new: true }
    );
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    res.json(invoice);
});

// Delete invoice
router.delete('/:id', auth, async (req, res) => {
    const invoice = await Invoice.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    res.json({ message: 'Invoice deleted' });
});

export default router;
