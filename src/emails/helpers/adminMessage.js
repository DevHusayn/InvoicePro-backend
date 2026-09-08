import {
    sanitizeEmail,
    sanitizeOptionalEmail,
    sanitizePlainText,
} from '../../../utils/sanitize.js';
import { getNoReplyEmail, getSupportEmail, getSupportFromEmail, getWebsiteUrl } from '../config.js';

export const ADMIN_MESSAGE_FROM_PRESETS = ['noreply', 'support', 'custom'];
export const ADMIN_MESSAGE_SUBJECT_MAX = 200;
export const ADMIN_MESSAGE_PREVIEW_MAX = 200;
export const ADMIN_MESSAGE_BODY_MAX = 8000;
export const ADMIN_MESSAGE_FROM_NAME_MAX = 80;
export const ADMIN_MESSAGE_ACTION_LABEL_MAX = 40;
export const ADMIN_MESSAGE_ACTION_PATH_MAX = 300;

export const ADMIN_MESSAGE_ACTIONS = [
    { id: 'none', label: 'No button', path: null, buttonLabel: '' },
    { id: 'dashboard', label: 'Go to dashboard', path: '/', buttonLabel: 'Go to dashboard' },
    { id: 'invoices', label: 'View invoices', path: '/invoices', buttonLabel: 'View invoices' },
    { id: 'quotations', label: 'View quotations', path: '/quotations', buttonLabel: 'View quotations' },
    { id: 'settings', label: 'Open settings', path: '/settings', buttonLabel: 'Open settings' },
    { id: 'billing', label: 'Manage billing', path: '/settings/plan-billing', buttonLabel: 'Manage billing' },
    { id: 'upgrade', label: 'Upgrade to Premium', path: '/upgrade', buttonLabel: 'Upgrade to Premium' },
    { id: 'custom', label: 'Custom Waraqah link', path: null, buttonLabel: 'Open Waraqah' },
];

export const ADMIN_MESSAGE_TEMPLATES = [
    {
        id: 'blank',
        label: 'Blank message',
        subject: '',
        preview: '',
        body: '',
        actionPreset: 'none',
        actionLabel: '',
    },
    {
        id: 'we-miss-you',
        label: 'We miss you',
        subject: 'We miss you at Waraqah',
        preview: 'Your workspace and records are still here whenever you are ready.',
        body: [
            "It's been a while since we last saw you on Waraqah, and we wanted to check in.",
            'Your clients, products, and records are still saved and ready whenever you are. If something was not working, just reply to this email. We would genuinely like to fix it.',
            'Looking forward to having you back.',
            'The Waraqah Team',
        ].join('\n\n'),
        actionPreset: 'dashboard',
        actionLabel: 'Go to dashboard',
    },
    {
        id: 'finish-setup',
        label: 'Finish setup',
        subject: 'Your Waraqah workspace is ready',
        preview: 'Add your first client or product and start using your workspace.',
        body: [
            'Your Waraqah workspace is ready, and you can pick up right where you left off.',
            'Add a client or product, then create a document and send it. Most people are up and running in a few minutes.',
            'If you get stuck, reply to this email and we will help.',
            'The Waraqah Team',
        ].join('\n\n'),
        actionPreset: 'dashboard',
        actionLabel: 'Go to dashboard',
    },
    {
        id: 'try-premium',
        label: 'Try Premium',
        subject: 'Ready when you are to grow on Waraqah',
        preview: 'Premium removes the free-plan limits and keeps your records intact.',
        body: [
            'If you want more room to grow, branding, or fewer free-plan limits, Premium is ready when you are.',
            'You can upgrade in a minute and keep all of your existing records.',
            'Reply if you have any questions about the plan.',
            'The Waraqah Team',
        ].join('\n\n'),
        actionPreset: 'upgrade',
        actionLabel: 'Upgrade to Premium',
    },
    {
        id: 'billing-help',
        label: 'Billing help',
        subject: 'A quick note about your Waraqah billing',
        preview: 'Review your plan and payment method, or reply and we will help.',
        body: [
            'We wanted to make sure everything is okay with your Waraqah billing.',
            'You can review your plan, payment method, and billing history from Settings. If a charge failed or something looks off, reply to this email and we will sort it out.',
            'The Waraqah Team',
        ].join('\n\n'),
        actionPreset: 'billing',
        actionLabel: 'Manage billing',
    },
    {
        id: 'need-a-hand',
        label: 'Need a hand?',
        subject: 'Need any help with Waraqah?',
        preview: 'Reply to this email if something is not working or you have a question.',
        body: [
            'Just checking in to see if you need any help with Waraqah.',
            'If something is not working, or you have a question about your workspace, clients, or account, reply to this email. We are happy to help.',
            'The Waraqah Team',
        ].join('\n\n'),
        actionPreset: 'none',
        actionLabel: '',
    },
];

const ACTION_IDS = new Set(ADMIN_MESSAGE_ACTIONS.map((action) => action.id));
const TEMPLATE_IDS = new Set(ADMIN_MESSAGE_TEMPLATES.map((template) => template.id));
const SAFE_APP_PATH = /^\/[A-Za-z0-9/_\-.?=&%#]*$/;

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function validationError(message) {
    const err = new Error(message);
    err.status = 400;
    return err;
}

export function sanitizeAdminMessageBody(value, maxLen = ADMIN_MESSAGE_BODY_MAX) {
    if (value === undefined || value === null) return '';
    const normalized = String(value)
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(CONTROL_CHARS, '');
    return normalized.slice(0, maxLen).trim();
}

export function splitBodyParagraphs(body) {
    return sanitizeAdminMessageBody(body)
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
}

export function getSupportFromAddress() {
    return `Waraqah <${getSupportFromEmail()}>`;
}

export function getNoReplyFromAddress() {
    return `Waraqah <${getNoReplyEmail()}>`;
}

export function sanitizeFromName(value) {
    return sanitizePlainText(value, ADMIN_MESSAGE_FROM_NAME_MAX)
        .replace(/[<>"\r\n]/g, '')
        .trim();
}

/** "Haybah" → "Haybah from Waraqah". Leaves names that already include Waraqah as-is. */
export function formatFromDisplayName(fromName) {
    const name = sanitizeFromName(fromName);
    if (!name) return '';
    if (/from\s+waraqah/i.test(name)) return name;
    return `${name} from Waraqah`;
}

function formatFromHeader(displayName, email) {
    return `${displayName} <${email}>`;
}

export function resolveAdminMessageSender(fromPreset, replyTo = '', fromName = '') {
    const preset = ADMIN_MESSAGE_FROM_PRESETS.includes(fromPreset) ? fromPreset : 'support';
    const customReplyTo = String(replyTo || '').trim();
    const personalName = formatFromDisplayName(fromName);

    if (preset === 'noreply') {
        return {
            from: formatFromHeader(personalName || 'Waraqah', getNoReplyEmail()),
            replyTo: customReplyTo || undefined,
        };
    }

    const supportInbox = getSupportEmail();
    const from = formatFromHeader(personalName || 'Waraqah', getSupportFromEmail());

    if (preset === 'custom') {
        return {
            from,
            replyTo: customReplyTo,
        };
    }

    return {
        from,
        replyTo: customReplyTo || supportInbox,
    };
}

function getAppBaseUrl() {
    return (process.env.FRONTEND_URL || getWebsiteUrl()).replace(/\/$/, '');
}

function joinAppUrl(path) {
    const base = getAppBaseUrl();
    if (!path || path === '/') return base;
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function allowedActionHosts() {
    const hosts = new Set(['mywaraqah.com', 'www.mywaraqah.com', 'localhost', '127.0.0.1']);
    for (const raw of [process.env.FRONTEND_URL, getWebsiteUrl()]) {
        try {
            hosts.add(new URL(raw).hostname);
        } catch {
            /* ignore invalid env URLs */
        }
    }
    return hosts;
}

export function listAdminMessageActionOptions() {
    return ADMIN_MESSAGE_ACTIONS.map((action) => ({
        id: action.id,
        label: action.label,
        requiresPath: action.id === 'custom',
        defaultLabel: action.buttonLabel,
    }));
}

export function resolveAdminMessageAction(actionPreset = 'none', actionPath = '', actionLabel = '') {
    const preset = ACTION_IDS.has(actionPreset) ? actionPreset : 'none';
    if (preset === 'none') {
        return { actionPreset: 'none', actionUrl: '', actionLabel: '', actionPath: '' };
    }

    const definition = ADMIN_MESSAGE_ACTIONS.find((action) => action.id === preset);
    const label = sanitizePlainText(actionLabel, ADMIN_MESSAGE_ACTION_LABEL_MAX)
        .replace(/[<>"\r\n]/g, '')
        .trim() || definition.buttonLabel;

    if (preset !== 'custom') {
        return {
            actionPreset: preset,
            actionUrl: joinAppUrl(definition.path),
            actionLabel: label,
            actionPath: definition.path || '',
        };
    }

    const raw = String(actionPath || '').trim();
    if (!raw) {
        throw validationError('Enter a Waraqah path or link for the button.');
    }

    if (raw.startsWith('/')) {
        if (
            raw.length > ADMIN_MESSAGE_ACTION_PATH_MAX
            || !SAFE_APP_PATH.test(raw)
            || raw.includes('//')
            || raw.includes('\\')
        ) {
            throw validationError('Enter a Waraqah path like /invoices or /settings/plan-billing.');
        }
        return {
            actionPreset: 'custom',
            actionUrl: joinAppUrl(raw),
            actionLabel: label,
            actionPath: raw,
        };
    }

    let parsed;
    try {
        parsed = new URL(raw);
    } catch {
        throw validationError('Enter a valid https link or a path like /invoices.');
    }

    const localHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !localHttp) {
        throw validationError('Custom links must use https.');
    }
    if (!allowedActionHosts().has(parsed.hostname)) {
        throw validationError('Custom links must stay on Waraqah.');
    }

    return {
        actionPreset: 'custom',
        actionUrl: parsed.toString(),
        actionLabel: label,
        actionPath: raw.slice(0, ADMIN_MESSAGE_ACTION_PATH_MAX),
    };
}

function fillTemplateText(value, firstName) {
    return String(value || '').replace(/\{\{\s*firstName\s*\}\}/g, firstName);
}

export function listAdminMessageTemplates() {
    return ADMIN_MESSAGE_TEMPLATES.map((template) => ({
        id: template.id,
        label: template.label,
        subject: template.subject,
        preview: template.preview,
        body: template.body,
        actionPreset: template.actionPreset,
        actionLabel: template.actionLabel,
    }));
}

export function applyAdminMessageTemplate(templateId, { firstName } = {}) {
    const id = TEMPLATE_IDS.has(templateId) ? templateId : 'blank';
    const template = ADMIN_MESSAGE_TEMPLATES.find((item) => item.id === id);
    const name = sanitizePlainText(firstName, 40).split(/\s+/)[0] || 'there';

    return {
        templateId: id,
        subject: fillTemplateText(template.subject, name),
        preview: fillTemplateText(template.preview, name),
        body: fillTemplateText(template.body, name),
        actionPreset: template.actionPreset || 'none',
        actionLabel: template.actionLabel || '',
    };
}

export function listAdminMessageSenderOptions() {
    return [
        {
            id: 'noreply',
            label: 'No-reply',
            from: getNoReplyFromAddress(),
            requiresReplyTo: false,
            hint: `Sent as ${getNoReplyFromAddress()}. The email tells recipients not to reply.`,
        },
        {
            id: 'support',
            label: 'Support',
            from: getSupportFromAddress(),
            requiresReplyTo: false,
            hint: `Sent from ${getSupportFromEmail()}. Replies go to ${getSupportEmail()}.`,
        },
        {
            id: 'custom',
            label: 'Custom reply address',
            from: getSupportFromAddress(),
            requiresReplyTo: true,
            hint: `Sent from ${getSupportFromEmail()}. Replies go to the address you enter.`,
        },
    ];
}

export function parseAdminMessageInput(body = {}) {
    const subject = sanitizePlainText(body.subject, ADMIN_MESSAGE_SUBJECT_MAX);
    const preview = sanitizePlainText(body.preview, ADMIN_MESSAGE_PREVIEW_MAX);
    const message = sanitizeAdminMessageBody(body.body ?? body.message);
    const fromName = sanitizeFromName(body.fromName);
    const fromPreset = sanitizePlainText(body.fromPreset, 20).toLowerCase() || 'support';

    if (!ADMIN_MESSAGE_FROM_PRESETS.includes(fromPreset)) {
        throw validationError('Choose a valid sender.');
    }
    if (!subject) {
        throw validationError('Please enter a subject.');
    }
    if (!message) {
        throw validationError('Please enter a message.');
    }

    let replyTo = '';
    if (fromPreset === 'custom') {
        replyTo = sanitizeEmail(body.replyTo);
    } else if (body.replyTo) {
        replyTo = sanitizeOptionalEmail(body.replyTo);
    }

    const sender = resolveAdminMessageSender(fromPreset, replyTo, fromName);
    if (fromPreset === 'custom' && !sender.replyTo) {
        throw validationError('Enter a valid reply-to email.');
    }

    const actionPreset = sanitizePlainText(body.actionPreset, 20).toLowerCase() || 'none';
    if (!ACTION_IDS.has(actionPreset)) {
        throw validationError('Choose a valid action button.');
    }
    const action = resolveAdminMessageAction(actionPreset, body.actionPath, body.actionLabel);

    return {
        subject,
        preview,
        body: message,
        fromPreset,
        fromName,
        from: sender.from,
        replyTo: sender.replyTo,
        actionPreset: action.actionPreset,
        actionLabel: action.actionLabel,
        actionUrl: action.actionUrl,
        actionPath: action.actionPath,
    };
}
