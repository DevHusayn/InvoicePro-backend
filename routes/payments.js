import express from 'express';
import crypto from 'crypto';
import auth from '../middleware/auth.js';
import requireEmailVerified from '../middleware/requireEmailVerified.js';
import User from '../models/User.js';
import Payment from '../models/Payment.js';
import BusinessInfo from '../models/CompanyInfo.js';
import {
    initializeTransaction,
    verifyTransaction,
    generateReference,
    fetchSubscription,
    disableSubscription,
    PREMIUM_AMOUNT_NGN,
    PREMIUM_AMOUNT_KOBO,
    PREMIUM_YEARLY_AMOUNT_NGN,
    PREMIUM_LIST_PRICE_YEARLY_NGN,
    PREMIUM_YEARLY_SAVINGS_NGN,
    getBillingConfig,
    normalizeBillingInterval,
} from '../services/paystack.js';
import { getOrCreatePremiumPlanCode } from '../services/paystackPlan.js';
import { activatePremiumForUser, deactivatePremiumSubscription } from '../services/premiumActivation.js';
import { toBusinessInfoResponse, isPremiumActive } from '../utils/businessInfoHelpers.js';
import { isOriginAllowed } from '../utils/corsConfig.js';
import {
    notifyPremiumUpgradeSuccess,
    notifyPremiumPaymentFailed,
    notifyPremiumSubscriptionCancelled,
} from '../src/emails/helpers/premiumNotifications.js';
import {
    parsePagination,
    paginateFind,
    buildPaginationMeta,
} from '../utils/pagination.js';
import { paymentVerificationLimiter } from '../middleware/rateLimits.js';

const router = express.Router();

function getCallbackUrl(req) {
    const fromClient = req.body?.callbackOrigin;
    if (fromClient) {
        const normalized = String(fromClient).replace(/\/$/, '');
        if (isOriginAllowed(normalized)) {
            return `${normalized}/upgrade/callback`;
        }
    }
    const base = (process.env.FRONTEND_URL || 'http://localhost:5173')
        .toString()
        .replace(/\/$/, '');
    return `${base}/upgrade/callback`;
}

function subscriptionMetaFromCharge(data) {
    const sub = data.subscription || data.authorization?.subscription_code;
    const subscriptionCode = typeof sub === 'string' ? sub : sub?.subscription_code;
    return {
        subscriptionCode: subscriptionCode || '',
        customerCode: data.customer?.customer_code || data.customer?.id || '',
        emailToken: data.subscription?.email_token || '',
    };
}

function monthsForInterval(interval) {
    return getBillingConfig(interval).months;
}

function renewalMessage(interval) {
    return interval === 'yearly'
        ? 'Subscription active. Premium renews automatically each year.'
        : 'Subscription active. Premium renews automatically each month.';
}

async function disablePreviousMonthlySubscription(userId) {
    const info = await BusinessInfo.findOne({ userId });
    if (!info?.paystackSubscriptionCode) {
        return;
    }
    const isMonthlySub = !info.billingInterval || info.billingInterval === 'monthly';
    if (!isMonthlySub) {
        return;
    }

    let emailToken = info.paystackEmailToken;
    if (!emailToken) {
        const sub = await fetchSubscription(info.paystackSubscriptionCode);
        emailToken = sub.email_token;
    }

    try {
        await disableSubscription(info.paystackSubscriptionCode, emailToken);
    } catch (err) {
        console.error('Could not disable previous monthly subscription:', err.message);
    }
}

async function fulfillPremiumPayment(payment, paystackData) {
    if (payment.status === 'success') {
        return payment;
    }

    const billingInterval = normalizeBillingInterval(payment.billingInterval || 'monthly');
    const months = monthsForInterval(billingInterval);

    payment.status = 'success';
    payment.paidAt = paystackData.paid_at ? new Date(paystackData.paid_at) : new Date();
    payment.channel = paystackData.channel || '';
    payment.billingInterval = billingInterval;
    const subMeta = subscriptionMetaFromCharge(paystackData);
    if (subMeta.subscriptionCode) {
        payment.paystackSubscriptionCode = subMeta.subscriptionCode;
        payment.type = 'subscription';
    }
    await payment.save();

    if (payment.switchFromMonthly && billingInterval === 'yearly') {
        await disablePreviousMonthlySubscription(payment.userId);
    }

    await activatePremiumForUser(payment.userId, {
        months,
        billingInterval,
        subscription: subMeta.subscriptionCode ? subMeta : null,
    });
    await notifyPremiumUpgradeSuccess(payment.userId, { billingInterval });
    return payment;
}

function formatPaymentForClient(payment) {
    return {
        id: String(payment._id),
        reference: payment.reference,
        amount: payment.amount / 100,
        currency: payment.currency || 'NGN',
        status: payment.status,
        type: payment.type,
        billingInterval: payment.billingInterval || null,
        channel: payment.channel || '',
        paidAt: payment.paidAt,
        createdAt: payment.createdAt,
    };
}

async function recordSubscriptionCharge(userId, paystackData, billingInterval = 'monthly') {
    const reference = paystackData.reference;
    if (!reference) return;

    const existing = await Payment.findOne({ reference });
    if (existing) return;

    const interval = normalizeBillingInterval(billingInterval);
    const fallbackAmount = getBillingConfig(interval).amountKobo;

    await Payment.create({
        userId,
        reference,
        amount: paystackData.amount || fallbackAmount,
        currency: (paystackData.currency || 'NGN').toUpperCase(),
        status: 'success',
        type: 'subscription',
        billingInterval: interval,
        channel: paystackData.channel || '',
        paidAt: paystackData.paid_at ? new Date(paystackData.paid_at) : new Date(),
        paystackSubscriptionCode: paystackData.subscription?.subscription_code || '',
    });
}

async function renewBySubscriptionCode(subscriptionCode, paystackData) {
    const info = await BusinessInfo.findOne({ paystackSubscriptionCode: subscriptionCode });
    if (!info) return;

    const billingInterval = normalizeBillingInterval(info.billingInterval || 'monthly');
    const months = monthsForInterval(billingInterval);
    const subMeta = subscriptionMetaFromCharge(paystackData);

    await activatePremiumForUser(info.userId, {
        months,
        billingInterval,
        subscription: { ...subMeta, subscriptionCode },
    });
    await recordSubscriptionCharge(info.userId, paystackData, billingInterval);
}

/** Public pricing info + subscription status (used by upgrade flow) */
router.get('/plan', auth, paymentVerificationLimiter, async (req, res) => {
    try {
        const info = await BusinessInfo.findOne({ userId: req.user.userId });
        const secretKey = process.env.PAYSTACK_SECRET_KEY || '';

        if (secretKey) {
            try {
                if (!process.env.PAYSTACK_PLAN_CODE) {
                    await getOrCreatePremiumPlanCode('monthly');
                }
                if (!process.env.PAYSTACK_PLAN_CODE_YEARLY) {
                    await getOrCreatePremiumPlanCode('yearly');
                }
            } catch {
                /* plan creation optional for display */
            }
        }

        res.json({
            name: 'Waraqah Premium',
            amount: PREMIUM_AMOUNT_NGN,
            currency: 'NGN',
            interval: 'monthly',
            billing: 'Auto-renews every month via Paystack',
            plans: {
                monthly: {
                    amount: PREMIUM_AMOUNT_NGN,
                    interval: 'monthly',
                    listAmount: 5000,
                },
                yearly: {
                    amount: PREMIUM_YEARLY_AMOUNT_NGN,
                    interval: 'yearly',
                    listAmount: PREMIUM_LIST_PRICE_YEARLY_NGN,
                    savings: PREMIUM_YEARLY_SAVINGS_NGN,
                },
            },
            paystackConfigured: Boolean(secretKey),
            publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
            isPaystackTestMode: secretKey.startsWith('sk_test_'),
            devPlanToggleEnabled: process.env.ALLOW_DEV_PLAN === 'true',
            subscription: info?.subscriptionStatus === 'active'
                ? {
                    status: info.subscriptionStatus,
                    renewsAt: info.premiumUntil,
                    code: info.paystackSubscriptionCode,
                    billingInterval: info.billingInterval || null,
                }
                : null,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/** Billing history for the authenticated user */
router.get('/history', auth, async (req, res) => {
    try {
        const { page, limit, skip } = parsePagination(req);
        const { data, total } = await paginateFind(
            Payment,
            { userId: req.user.userId },
            {
                skip,
                limit,
                sort: { paidAt: -1, createdAt: -1 },
                lean: true,
            }
        );
        res.json({
            data: data.map(formatPaymentForClient),
            pagination: buildPaginationMeta(page, limit, total),
        });
    } catch (err) {
        res.status(500).json({ message: err.message || 'Could not load billing history' });
    }
});

/** Start Paystack subscription checkout (first payment + recurring plan) */
router.post('/initialize', auth, requireEmailVerified, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const billingInterval = normalizeBillingInterval(req.body?.interval);
        const switchFromMonthly = Boolean(req.body?.switchFromMonthly);
        const billingConfig = getBillingConfig(billingInterval);

        if (switchFromMonthly) {
            if (billingInterval !== 'yearly') {
                return res.status(400).json({ message: 'Switch is only available for yearly billing' });
            }
            const info = await BusinessInfo.findOne({ userId: user._id });
            if (!info?.paystackSubscriptionCode) {
                return res.status(400).json({ message: 'No active monthly subscription to switch from' });
            }
            const isMonthlySub = !info.billingInterval || info.billingInterval === 'monthly';
            if (!isMonthlySub) {
                return res.status(400).json({ message: 'No active monthly subscription to switch from' });
            }
            if (info.subscriptionStatus !== 'active') {
                return res.status(400).json({ message: 'Your monthly subscription is not active' });
            }
        }

        const planCode = await getOrCreatePremiumPlanCode(billingInterval);
        const reference = generateReference(user._id);

        const payment = await Payment.create({
            userId: user._id,
            reference,
            amount: billingConfig.amountKobo,
            currency: 'NGN',
            status: 'pending',
            type: 'subscription',
            billingInterval,
            switchFromMonthly,
        });

        const callbackUrl = getCallbackUrl(req);

        const data = await initializeTransaction({
            email: user.email,
            amountKobo: billingConfig.amountKobo,
            reference,
            callbackUrl,
            planCode,
            metadata: {
                userId: String(user._id),
                paymentId: String(payment._id),
                plan: 'premium',
                billing: 'subscription',
                interval: billingInterval,
                switchFromMonthly,
            },
        });

        res.json({
            authorization_url: data.authorization_url,
            access_code: data.access_code,
            reference,
            callback_url: callbackUrl,
        });
    } catch (err) {
        res.status(err.message.includes('not configured') ? 503 : 500).json({
            message: err.message || 'Could not start payment',
        });
    }
});

/** Verify after Paystack redirect — checks local DB before calling Paystack */
router.get('/verify/:reference', auth, paymentVerificationLimiter, async (req, res) => {
    try {
        const reference = req.params.reference;
        const payment = await Payment.findOne({
            reference,
            userId: req.user.userId,
        });
        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        let businessInfo = await BusinessInfo.findOne({ userId: req.user.userId });
        const billingInterval = normalizeBillingInterval(payment.billingInterval || 'monthly');

        if (payment.status === 'success') {
            return res.json({
                message: renewalMessage(billingInterval),
                businessInfo: toBusinessInfoResponse(businessInfo),
                alreadyVerified: true,
            });
        }

        // Webhook may have activated Premium before this verify call runs.
        if (payment.status === 'pending' && isPremiumActive(businessInfo)) {
            payment.status = 'success';
            payment.paidAt = payment.paidAt || new Date();
            await payment.save();

            return res.json({
                message: renewalMessage(billingInterval),
                businessInfo: toBusinessInfoResponse(businessInfo),
                alreadyVerified: true,
            });
        }

        const data = await verifyTransaction(reference);
        if (data.status !== 'success') {
            payment.status = 'failed';
            await payment.save();
            return res.status(400).json({
                message: 'Payment was not completed',
                status: data.status,
            });
        }

        await fulfillPremiumPayment(payment, data);

        const months = monthsForInterval(billingInterval);

        if (data.subscription?.subscription_code) {
            const sub = await fetchSubscription(data.subscription.subscription_code);
            await activatePremiumForUser(req.user.userId, {
                months,
                billingInterval,
                subscription: {
                    subscriptionCode: sub.subscription_code,
                    customerCode: sub.customer?.customer_code || '',
                    emailToken: sub.email_token || '',
                },
            });
        }

        businessInfo = await BusinessInfo.findOne({ userId: req.user.userId });

        res.json({
            message: renewalMessage(billingInterval),
            businessInfo: toBusinessInfoResponse(businessInfo),
        });
    } catch (err) {
        res.status(500).json({ message: err.message || 'Verification failed' });
    }
});

/** Cancel auto-renewal (stays premium until premiumUntil) */
router.post('/subscription/cancel', auth, async (req, res) => {
    try {
        const info = await BusinessInfo.findOne({ userId: req.user.userId });
        if (!info?.paystackSubscriptionCode) {
            return res.status(400).json({ message: 'No active subscription found' });
        }

        let emailToken = info.paystackEmailToken;
        if (!emailToken) {
            const sub = await fetchSubscription(info.paystackSubscriptionCode);
            emailToken = sub.email_token;
            info.paystackEmailToken = emailToken;
        }

        await disableSubscription(info.paystackSubscriptionCode, emailToken);
        await deactivatePremiumSubscription(req.user.userId);
        await notifyPremiumSubscriptionCancelled(req.user.userId, {
            billingInterval: info.billingInterval,
        });

        res.json({
            message: 'Auto-renewal cancelled. Premium remains until the end of your billing period.',
            businessInfo: toBusinessInfoResponse(info),
        });
    } catch (err) {
        res.status(500).json({ message: err.message || 'Could not cancel subscription' });
    }
});

/** Paystack webhook */
export async function paystackWebhookHandler(req, res) {
    try {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        if (!secret) return res.status(503).send('Paystack not configured');

        const signature = req.headers['x-paystack-signature'];
        const hash = crypto.createHmac('sha512', secret).update(req.body).digest('hex');
        if (hash !== signature) return res.status(401).send('Invalid signature');

        const event = JSON.parse(req.body.toString());
        const { event: eventType, data } = event;

        if (eventType === 'charge.success') {
            const { reference } = data;
            const payment = await Payment.findOne({ reference });
            if (payment) {
                await fulfillPremiumPayment(payment, data);
            } else if (data.subscription?.subscription_code) {
                await renewBySubscriptionCode(data.subscription.subscription_code, data);
            }
        }

        if (eventType === 'subscription.create') {
            const userId = data.metadata?.userId || data.customer?.metadata?.userId;
            const subCode = data.subscription_code;
            const billingInterval = normalizeBillingInterval(
                data.metadata?.interval || (data.plan?.interval === 'annually' ? 'yearly' : 'monthly')
            );
            const months = monthsForInterval(billingInterval);

            if (userId && subCode) {
                await activatePremiumForUser(userId, {
                    months,
                    billingInterval,
                    subscription: {
                        subscriptionCode: subCode,
                        customerCode: data.customer?.customer_code || '',
                        emailToken: data.email_token || '',
                    },
                });
            } else if (subCode) {
                const info = await BusinessInfo.findOne({ paystackSubscriptionCode: subCode });
                if (!info) {
                    const payment = await Payment.findOne({ paystackSubscriptionCode: subCode });
                    if (payment) {
                        const interval = normalizeBillingInterval(payment.billingInterval || 'monthly');
                        await activatePremiumForUser(payment.userId, {
                            months: monthsForInterval(interval),
                            billingInterval: interval,
                            subscription: {
                                subscriptionCode: subCode,
                                emailToken: data.email_token || '',
                            },
                        });
                    }
                }
            }
        }

        if (eventType === 'subscription.disable' || eventType === 'subscription.not_renew') {
            const subCode = data.subscription_code;
            const info = await BusinessInfo.findOne({ paystackSubscriptionCode: subCode });
            if (info) {
                info.subscriptionStatus = 'cancelled';
                await info.save();
                await notifyPremiumSubscriptionCancelled(info.userId, {
                    billingInterval: info.billingInterval,
                });
            }
        }

        if (eventType === 'invoice.payment_failed') {
            const subCode = data.subscription?.subscription_code;
            if (subCode) {
                const info = await BusinessInfo.findOne({ paystackSubscriptionCode: subCode });
                await BusinessInfo.updateOne(
                    { paystackSubscriptionCode: subCode },
                    { $set: { subscriptionStatus: 'attention' } }
                );
                if (info?.userId) {
                    await notifyPremiumPaymentFailed(info.userId);
                }
            }
        }

        res.sendStatus(200);
    } catch (err) {
        console.error('Paystack webhook error:', err);
        res.sendStatus(500);
    }
}

export default router;
