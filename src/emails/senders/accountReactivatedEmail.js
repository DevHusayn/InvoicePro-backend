import React from 'react';
import { sendEmail } from '../sendEmail.js';
import AccountReactivatedEmail from '../templates/AccountReactivatedEmail.js';

export async function sendAccountReactivatedEmail({ to, userName, dashboardUrl }) {
    return sendEmail({
        to,
        subject: 'Your Waraqah account has been reactivated',
        type: 'account-reactivated',
        react: React.createElement(AccountReactivatedEmail, { userName, dashboardUrl }),
        text: 'Your Waraqah account has been reactivated. You can sign in and access your workspace again.',
    });
}
