import {
    paystackRequest,
    PREMIUM_AMOUNT_KOBO,
    PREMIUM_YEARLY_AMOUNT_KOBO,
    normalizeBillingInterval,
} from './paystack.js';

const PLAN_CONFIG = {
    monthly: {
        name: 'Waraqah Premium Monthly',
        interval: 'monthly',
        amountKobo: PREMIUM_AMOUNT_KOBO,
        envKey: 'PAYSTACK_PLAN_CODE',
        description: 'Waraqah Premium — logo on PDFs, sidebar branding',
    },
    yearly: {
        name: 'Waraqah Premium Yearly',
        interval: 'annually',
        amountKobo: PREMIUM_YEARLY_AMOUNT_KOBO,
        envKey: 'PAYSTACK_PLAN_CODE_YEARLY',
        description: 'Waraqah Premium — same features, billed once per year',
    },
};

const cachedPlanCodes = {
    monthly: process.env.PAYSTACK_PLAN_CODE || null,
    yearly: process.env.PAYSTACK_PLAN_CODE_YEARLY || null,
};

/** Returns Paystack plan_code (PLN_xxx). Creates plan once if not in env. */
export async function getOrCreatePremiumPlanCode(interval = 'monthly') {
    const billingInterval = normalizeBillingInterval(interval);
    const config = PLAN_CONFIG[billingInterval];

    if (cachedPlanCodes[billingInterval]) {
        return cachedPlanCodes[billingInterval];
    }

    const envCode = process.env[config.envKey];
    if (envCode) {
        cachedPlanCodes[billingInterval] = envCode;
        return envCode;
    }

    const plan = await paystackRequest('/plan', {
        method: 'POST',
        body: JSON.stringify({
            name: config.name,
            interval: config.interval,
            amount: config.amountKobo,
            currency: 'NGN',
            description: config.description,
        }),
    });

    cachedPlanCodes[billingInterval] = plan.plan_code;
    console.log(
        `[Paystack] Created ${billingInterval} subscription plan. Add to .env:\n${config.envKey}=${plan.plan_code}`
    );
    return plan.plan_code;
}
