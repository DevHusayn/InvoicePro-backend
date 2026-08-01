import User from '../models/User.js';
import asyncHandler from './asyncHandler.js';

export default asyncHandler(async function requireAdmin(req, res, next) {
    const adminUser = await User.findById(req.user.userId).select('isAdmin').lean();
    if (!adminUser?.isAdmin) {
        return res.status(403).json({ message: 'Forbidden: Admins only' });
    }
    next();
});
