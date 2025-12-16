
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import BusinessInfo from '../models/CompanyInfo.js';
import auth from '../middleware/auth.js';
import Invoice from '../models/Invoice.js';
import Client from '../models/Client.js';
const router = express.Router();

// Admin: Suspend/Activate user
router.patch('/admin/users/:id/status', auth, async (req, res) => {
    try {
        const adminUser = await User.findById(req.user.userId);
        if (!adminUser || !adminUser.isAdmin) return res.status(403).json({ message: 'Forbidden: Admins only' });
        if (req.user.userId === req.params.id) return res.status(400).json({ message: 'You cannot change your own status.' });
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        user.status = user.status === 'active' ? 'suspended' : 'active';
        await user.save();
        res.json({ message: 'User status updated', status: user.status });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// Admin: Promote/Demote user
router.patch('/admin/users/:id/admin', auth, async (req, res) => {
    try {
        const adminUser = await User.findById(req.user.userId);
        if (!adminUser || !adminUser.isAdmin) return res.status(403).json({ message: 'Forbidden: Admins only' });
        if (req.user.userId === req.params.id) return res.status(400).json({ message: 'You cannot change your own admin status.' });
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        user.isAdmin = !user.isAdmin;
        await user.save();
        res.json({ message: 'User admin status updated', isAdmin: user.isAdmin });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// Admin: Delete user
router.delete('/admin/users/:id', auth, async (req, res) => {
    try {
        const adminUser = await User.findById(req.user.userId);
        if (!adminUser || !adminUser.isAdmin) return res.status(403).json({ message: 'Forbidden: Admins only' });
        if (req.user.userId === req.params.id) return res.status(400).json({ message: 'You cannot delete yourself.' });
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        // Optionally, delete related business info, invoices, clients
        await BusinessInfo.deleteOne({ userId: req.params.id });
        await Invoice.deleteMany({ userId: req.params.id });
        await Client.deleteMany({ userId: req.params.id });
        res.json({ message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

router.get('/admin/users', auth, async (req, res) => {
    try {
        const adminUser = await User.findById(req.user.userId);
        if (!adminUser || !adminUser.isAdmin) {
            return res.status(403).json({ message: 'Forbidden: Admins only' });
        }
        const users = await User.find({}, '-password');
        const businessInfos = await BusinessInfo.find({});

        // Get invoice and client counts for each user
        const invoiceCounts = await Invoice.aggregate([
            { $group: { _id: '$userId', count: { $sum: 1 } } }
        ]);
        const clientCounts = await Client.aggregate([
            { $group: { _id: '$userId', count: { $sum: 1 } } }
        ]);

        const usersWithDetails = users.map(user => {
            const businessInfo = businessInfos.find(bi => bi.userId.toString() === user._id.toString()) || null;
            const invoiceCount = invoiceCounts.find(ic => ic._id.toString() === user._id.toString())?.count || 0;
            const clientCount = clientCounts.find(cc => cc._id.toString() === user._id.toString())?.count || 0;
            return {
                ...user.toObject(),
                businessInfo,
                invoiceCount,
                clientCount,
            };
        });
        res.json(usersWithDetails);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// Register
router.post('/register', async (req, res) => {
    try {
        const { email, password, name, businessInfo } = req.body;
        if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
        const existing = await User.findOne({ email });
        if (existing) return res.status(409).json({ message: 'Email already registered' });
        const hash = await bcrypt.hash(password, 10);
        const user = await User.create({ email, password: hash, name });
        // Save business info if provided (ensure all fields are present)
        if (businessInfo) {
            await BusinessInfo.create({
                userId: user._id,
                name: businessInfo.name || '',
                address: businessInfo.address || '',
                email: businessInfo.email || '',
                phone: businessInfo.phone || '',
                website: businessInfo.website || '',
                defaultCurrency: businessInfo.defaultCurrency || 'USD',
                taxRate: businessInfo.taxRate || 10,
                brandColor: businessInfo.brandColor || '#0ea5e9',
            });
        }
        res.status(201).json({ message: 'User registered', user: { id: user._id, email: user.email, name: user.name, isAdmin: user.isAdmin } });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// Login

// Rate limiting and lockout config
const MAX_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000; // 15 minutes

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ message: 'Invalid credentials' });

        // Check lockout
        if (user.lockUntil && user.lockUntil > Date.now()) {
            return res.status(423).json({ message: `Account locked. Try again after ${new Date(user.lockUntil).toLocaleTimeString()}` });
        }

        // Check password
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
            // Lock account if too many attempts
            if (user.failedLoginAttempts >= MAX_ATTEMPTS) {
                user.lockUntil = Date.now() + LOCK_TIME;
                await user.save();
                return res.status(423).json({ message: `Account locked due to too many failed attempts. Try again after ${new Date(user.lockUntil).toLocaleTimeString()}` });
            } else {
                await user.save();
            }
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Reset failed attempts and lock
        user.failedLoginAttempts = 0;
        user.lockUntil = undefined;
        user.lastLogin = new Date();
        await user.save();
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user._id, email: user.email, name: user.name, isAdmin: user.isAdmin, status: user.status, lastLogin: user.lastLogin } });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// Password reset request (send token)
import crypto from 'crypto';
import nodemailer from 'nodemailer';
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(200).json({ message: 'If the email exists, a reset link will be sent.' });
        const token = crypto.randomBytes(32).toString('hex');
        user.passwordResetToken = token;
        user.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
        await user.save();
        // Send email (configure your SMTP)
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false, // use TLS
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${token}`;
        await transporter.sendMail({
            to: user.email,
            subject: 'Password Reset',
            html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 1 hour.</p>`
        });
        res.json({ message: 'If the email exists, a reset link will be sent.' });
    } catch (err) {
        console.error('Forgot-password error:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// Password reset (set new password)
router.post('/reset-password/:token', async (req, res) => {
    try {
        const { password } = req.body;
        const user = await User.findOne({ passwordResetToken: req.params.token, passwordResetExpires: { $gt: Date.now() } });
        if (!user) return res.status(400).json({ message: 'Invalid or expired token' });
        const hash = await bcrypt.hash(password, 10);
        user.password = hash;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        user.failedLoginAttempts = 0;
        user.lockUntil = undefined;
        await user.save();
        res.json({ message: 'Password reset successful. You can now log in.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// Admin unlock user
router.patch('/admin/users/:id/unlock', auth, async (req, res) => {
    try {
        const adminUser = await User.findById(req.user.userId);
        if (!adminUser || !adminUser.isAdmin) return res.status(403).json({ message: 'Forbidden: Admins only' });
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        user.failedLoginAttempts = 0;
        user.lockUntil = undefined;
        await user.save();
        res.json({ message: 'User account unlocked.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

export default router;
