import React from 'react';
import { sendEmail } from '../sendEmail.js';
import PremiumUpgradeSuccessEmail from '../templates/PremiumUpgradeSuccessEmail.js';
import { formatCurrency } from '../formatters.js';

export async function sendPremiumUpgradeSuccessEmail({ to, userName, amount, currency = 'NGN', billingInterval = 'monthly', renewsAt }) {
    const intervalLabel = billingInterval === 'yearly' ? '/year' : '/month';
    return sendEmail({
        to,
        subject: 'Welcome to Waraqah Premium',
        type: 'premium-upgrade-success',
        react: React.createElement(PremiumUpgradeSuccessEmail, { userName, amount, currency, billingInterval, renewsAt }),
        text: [
            'Your Waraqah Premium subscription is active.',
            `Amount: ${formatCurrency(amount, currency)}${intervalLabel}`,
            renewsAt ? `Renews: ${renewsAt}` : null,
        ].filter(Boolean).join('\n'),
    });
}
