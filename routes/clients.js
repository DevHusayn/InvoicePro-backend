import express from 'express';
import Client from '../models/Client.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Get all clients for user
router.get('/', auth, async (req, res) => {
    const clients = await Client.find({ userId: req.user.userId });
    res.json(clients);
});

// Create client
router.post('/', auth, async (req, res) => {
    const client = await Client.create({ ...req.body, userId: req.user.userId });
    res.status(201).json(client);
});

// Update client
router.put('/:id', auth, async (req, res) => {
    const client = await Client.findOneAndUpdate(
        { _id: req.params.id, userId: req.user.userId },
        req.body,
        { new: true }
    );
    if (!client) return res.status(404).json({ message: 'Client not found' });
    res.json(client);
});

// Delete client
router.delete('/:id', auth, async (req, res) => {
    const client = await Client.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!client) return res.status(404).json({ message: 'Client not found' });
    res.json({ message: 'Client deleted' });
});

export default router;
