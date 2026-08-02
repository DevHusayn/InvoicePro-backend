import React from 'react';
import { Button, Section, Text } from '@react-email/components';
import EmailLayout, { emailStyles } from '../layouts/EmailLayout.js';
import { getSupportEmail } from '../config.js';

export default function AccountReactivatedEmail({ userName, dashboardUrl }) {
    const greetingName = userName?.trim() || 'there';
    const supportEmail = getSupportEmail();

    return React.createElement(
        EmailLayout,
        { preview: 'Your Waraqah account has been reactivated.' },
        React.createElement(Text, { style: emailStyles.heading }, 'Account reactivated'),
        React.createElement(
            Text,
            { style: emailStyles.paragraph },
            `Hi ${greetingName}, your Waraqah account has been reactivated. You can sign in and access your workspace again.`,
        ),
        React.createElement(
            Section,
            { style: emailStyles.buttonSection },
            React.createElement(Button, { href: dashboardUrl, style: emailStyles.button }, 'Go to dashboard'),
        ),
        React.createElement(
            Text,
            { style: emailStyles.muted },
            `If you have questions, contact us at ${supportEmail}.`,
        ),
    );
}
