import React from 'react';
import { sendEmail } from '../sendEmail.js';
import PremiumExpiryReminderEmail from '../templates/PremiumExpiryReminderEmail.js';

export async function sendPremiumExpiryReminderEmail({ to, userName, premiumUntil }) {
    return sendEmail({
        to,
        subject: 'Your Waraqah Premium access is ending soon',
        type: 'premium-expiry-reminder',
        react: React.createElement(PremiumExpiryReminderEmail, { userName, premiumUntil }),
        text: `Your Waraqah Premium access ends on ${premiumUntil}. Resubscribe to keep unlimited invoices and quotations, custom branding on your PDFs, and your other Premium benefits.`,
    });
}
