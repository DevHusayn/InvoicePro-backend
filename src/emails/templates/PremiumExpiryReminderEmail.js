import React from 'react';
import { Button, Section, Text } from '@react-email/components';
import EmailLayout, { emailStyles } from '../layouts/EmailLayout.js';
import { getFrontendBaseUrl } from '../helpers/invoiceContext.js';

export default function PremiumExpiryReminderEmail({ userName, premiumUntil }) {
    const greetingName = userName?.trim() || 'there';
    const upgradeUrl = `${getFrontendBaseUrl()}/upgrade`;

    return React.createElement(
        EmailLayout,
        { preview: `Your Waraqah Premium access ends on ${premiumUntil}.` },
        React.createElement(Text, { style: emailStyles.heading }, 'Premium access ending soon'),
        React.createElement(
            Text,
            { style: emailStyles.paragraph },
            `Hi ${greetingName}, your Waraqah Premium access ends on ${premiumUntil}.`,
        ),
        React.createElement(
            Text,
            { style: emailStyles.paragraph },
            'Resubscribe to keep unlimited invoices and quotations, custom branding on your PDFs, and your other Premium benefits.',
        ),
        React.createElement(
            Section,
            { style: emailStyles.buttonSection },
            React.createElement(Button, { href: upgradeUrl, style: emailStyles.button }, 'Resubscribe to Premium'),
        ),
    );
}
