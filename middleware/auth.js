import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { getTokenFromRequest } from '../utils/authCookie.js';
import asyncHandler from './asyncHandler.js';

const LAST_ACTIVE_THROTTLE_MS = 5 * 60 * 1000;

export default asyncHandler(async function auth(req, res, next) {
    const token = getTokenFromRequest(req);
    if (!token) {
        return res.status(401).json({ message: 'Not authenticated' });
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return res.status(401).json({ message: 'Invalid token' });
    }

    const user = await User.findById(decoded.userId).select('status').lean();
    if (!user) {
        return res.status(401).json({ message: 'User not found' });
    }
    if (user.status === 'suspended') {
        return res.status(403).json({ message: 'Account suspended. Contact support.' });
    }
    req.user = decoded;

    const throttleBefore = new Date(Date.now() - LAST_ACTIVE_THROTTLE_MS);
    User.updateOne(
        {
            _id: decoded.userId,
            $or: [{ lastActiveAt: { $exists: false } }, { lastActiveAt: { $lt: throttleBefore } }],
        },
        { $set: { lastActiveAt: new Date() } }
    ).catch(() => {});

    next();
});
