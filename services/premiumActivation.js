import BusinessInfo from '../models/CompanyInfo.js';
import { PLANS, defaultBusinessInfoFields } from '../utils/businessInfoHelpers.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Extend premium by N months from the later of now or current premiumUntil */
export async function activatePremiumForUser(
    userId,
    { months = 1, billingInterval = null, subscription = null, fromPayment = false } = {},
) {
    const extension = months * THIRTY_DAYS_MS;
    let info = await BusinessInfo.findOne({ userId });

    const base = info?.premiumUntil && new Date(info.premiumUntil) > new Date()
        ? new Date(info.premiumUntil)
        : new Date();
    const until = new Date(base.getTime() + extension);

    if (!info) {
        info = await BusinessInfo.create({
            userId,
            ...defaultBusinessInfoFields,
            plan: PLANS.PREMIUM,
            premiumUntil: until,
            subscriptionStatus: subscription ? 'active' : null,
            paystackSubscriptionCode: subscription?.subscriptionCode || '',
            paystackCustomerCode: subscription?.customerCode || '',
            paystackEmailToken: subscription?.emailToken || '',
            billingInterval: billingInterval || null,
        });
    } else {
        info.plan = PLANS.PREMIUM;
        info.premiumUntil = until;
        info.premiumExpiryReminderForUntil = null;
        if (billingInterval) info.billingInterval = billingInterval;
        if (subscription?.subscriptionCode) {
            info.subscriptionStatus = 'active';
            info.paystackSubscriptionCode = subscription.subscriptionCode;
            if (subscription.customerCode) info.paystackCustomerCode = subscription.customerCode;
            if (subscription.emailToken) info.paystackEmailToken = subscription.emailToken;
        } else if (
            fromPayment
            && (info.subscriptionStatus === 'cancelled' || info.subscriptionStatus === 'attention')
        ) {
            // Re-subscribe after cancel — restore access; Paystack sub code may link later via sync.
            info.subscriptionStatus = info.paystackSubscriptionCode ? 'active' : null;
        }
        await info.save();
    }
    return info;
}

export async function deactivatePremiumSubscription(userId) {
    const info = await BusinessInfo.findOne({ userId });
    if (!info) return null;
    info.subscriptionStatus = 'cancelled';
    await info.save();
    return info;
}

/** Attach Paystack subscription metadata without changing premiumUntil. */
export async function linkPaystackSubscription(userId, { subscription, billingInterval = null } = {}) {
    if (!subscription?.subscriptionCode) {
        return BusinessInfo.findOne({ userId });
    }

    let info = await BusinessInfo.findOne({ userId });
    if (!info) {
        info = await BusinessInfo.create({
            userId,
            ...defaultBusinessInfoFields,
            plan: PLANS.PREMIUM,
            subscriptionStatus: 'active',
            paystackSubscriptionCode: subscription.subscriptionCode,
            paystackCustomerCode: subscription.customerCode || '',
            paystackEmailToken: subscription.emailToken || '',
            billingInterval: billingInterval || null,
        });
        return info;
    }

    info.plan = PLANS.PREMIUM;
    info.subscriptionStatus = 'active';
    info.paystackSubscriptionCode = subscription.subscriptionCode;
    if (subscription.customerCode) info.paystackCustomerCode = subscription.customerCode;
    if (subscription.emailToken) info.paystackEmailToken = subscription.emailToken;
    if (billingInterval) info.billingInterval = billingInterval;
    await info.save();
    return info;
}

export function isPremiumActive(doc) {
    if (!doc || doc.plan !== PLANS.PREMIUM) return false;
    if (!doc.premiumUntil) return true;
    return new Date(doc.premiumUntil) > new Date();
}
