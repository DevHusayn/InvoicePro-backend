import {
    sendWelcomeEmail,
    sendEmailVerificationEmail,
    sendNewUserAdminNotification,
} from '../index.js';
import { getAdminNotifyEmail } from '../config.js';
import { getFrontendBaseUrl } from './invoiceContext.js';

function logSignupEmailFailures(results, types) {
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            console.error(`[Waraqah Email] Signup ${types[index]} failed:`, result.reason);
        }
    });
}

/**
 * Notify the platform admin about a new signup.
 * Failures are logged but never block signup.
 */
export async function notifyAdminNewUser({ user, businessName, signupMethod = 'email' }) {
    try {
        if (!user?.email?.trim()) return;

        const adminTo = getAdminNotifyEmail();
        if (!adminTo) return;

        await sendNewUserAdminNotification({
            to: adminTo,
            userName: user.name,
            userEmail: user.email.trim().toLowerCase(),
            businessName,
            signupMethod,
            signedUpAt: user.createdAt || new Date(),
            adminDashboardUrl: `${getFrontendBaseUrl()}/admin`,
        });
    } catch (err) {
        console.error('[Waraqah Email] Admin new-user notification failed:', err?.message || err);
    }
}

/**
 * Send verification + admin notification after email/password registration.
 * Welcome is deferred until the user verifies their email.
 * Must be awaited before the HTTP response on serverless (Vercel).
 * Failures are logged but do not block signup.
 */
export async function sendRegistrationEmails({ user, verificationToken, businessName }) {
    const verificationUrl = `${getFrontendBaseUrl()}/verify-email/${verificationToken}`;

    const results = await Promise.allSettled([
        sendEmailVerificationEmail({
            to: user.email,
            userName: user.name,
            verificationUrl,
        }),
        notifyAdminNewUser({
            user,
            businessName,
            signupMethod: 'email',
        }),
    ]);

    logSignupEmailFailures(results, ['email-verification', 'admin-new-user']);
}

/**
 * Send the founder welcome email after a manual signup verifies their email.
 * Must be awaited before the HTTP response on serverless (Vercel).
 * Failures are logged but do not block verification.
 */
export async function sendWelcomeAfterVerification({ user }) {
    if (!user?.email?.trim()) return;

    try {
        await sendWelcomeEmail({
            to: user.email,
            userName: user.name,
            dashboardUrl: getFrontendBaseUrl(),
        });
    } catch (err) {
        console.error('[Waraqah Email] Welcome-after-verification failed:', err?.message || err);
    }
}

/**
 * Send welcome + admin notification after OAuth signup (Google, etc.).
 * No verification email — the provider has already verified the address.
 * Must be awaited before the HTTP response on serverless (Vercel).
 * Failures are logged but do not block signup.
 */
export async function sendOAuthSignupEmails({ user, businessName, signupMethod = 'google' }) {
    const dashboardUrl = getFrontendBaseUrl();

    const results = await Promise.allSettled([
        sendWelcomeEmail({
            to: user.email,
            userName: user.name,
            dashboardUrl,
        }),
        notifyAdminNewUser({
            user,
            businessName,
            signupMethod,
        }),
    ]);

    logSignupEmailFailures(results, ['welcome', 'admin-new-user']);
}
