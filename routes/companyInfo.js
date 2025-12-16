
import express from 'express';
import BusinessInfo from '../models/CompanyInfo.js';
import auth from '../middleware/auth.js';

const router = express.Router();


// Get business info for user
router.get('/', auth, async (req, res) => {
    let info = await BusinessInfo.findOne({ userId: req.user.userId });
    if (!info) info = await BusinessInfo.create({ userId: req.user.userId });
    res.json(info);
});

// Update business info
router.put('/', auth, async (req, res) => {
    let info = await BusinessInfo.findOneAndUpdate(
        { userId: req.user.userId },
        req.body,
        { new: true, upsert: true }
    );
    res.json(info);
});

export default router;
