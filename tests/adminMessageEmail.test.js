import test from 'node:test';
import assert from 'node:assert/strict';
import {
    formatFromDisplayName,
    parseAdminMessageInput,
    resolveAdminMessageAction,
    resolveAdminMessageSender,
    sanitizeAdminMessageBody,
    splitBodyParagraphs,
    listAdminMessageActionOptions,
    listAdminMessageSenderOptions,
} from '../src/emails/helpers/adminMessage.js';

test('splitBodyParagraphs keeps blank-line separated blocks', () => {
    assert.deepEqual(
        splitBodyParagraphs('Hello\n\nPlease confirm your details.\nThanks'),
        ['Hello', 'Please confirm your details.\nThanks']
    );
});

test('sanitizeAdminMessageBody preserves newlines and strips control chars', () => {
    assert.equal(sanitizeAdminMessageBody('  Hello\r\nworld\x00  '), 'Hello\nworld');
});

test('resolveAdminMessageSender uses verified From for custom reply-to', () => {
    const sender = resolveAdminMessageSender('custom', 'ada@example.com');
    assert.match(sender.from, /@mywaraqah\.com>/);
    assert.equal(sender.replyTo, 'ada@example.com');
});

test('formatFromDisplayName builds Haybah from Waraqah', () => {
    assert.equal(formatFromDisplayName('Haybah'), 'Haybah from Waraqah');
    assert.equal(formatFromDisplayName('Haybah from Waraqah'), 'Haybah from Waraqah');
});

test('resolveAdminMessageSender uses a personal from name', () => {
    const sender = resolveAdminMessageSender('support', '', 'Haybah');
    assert.match(sender.from, /^Haybah from Waraqah </);
    assert.match(sender.from, /support@mywaraqah\.com>/);
});

test('resolveAdminMessageSender maps noreply and support presets', () => {
    const noreply = resolveAdminMessageSender('noreply');
    assert.equal(noreply.from, 'Waraqah <noreply@mywaraqah.com>');
    assert.equal(noreply.replyTo, undefined);

    const support = resolveAdminMessageSender('support');
    assert.equal(support.from, 'Waraqah <support@mywaraqah.com>');
    assert.equal(support.replyTo, 'support@mywaraqah.com');
});

test('parseAdminMessageInput requires subject, body, and custom reply-to', () => {
    assert.throws(
        () => parseAdminMessageInput({ body: 'Hello' }),
        /subject/i
    );
    assert.throws(
        () => parseAdminMessageInput({ subject: 'Hello' }),
        /message/i
    );
    assert.throws(
        () => parseAdminMessageInput({
            subject: 'Follow up',
            body: 'Please reply when you can.',
            fromPreset: 'custom',
        }),
        /email/i
    );

    const parsed = parseAdminMessageInput({
        subject: 'Follow up',
        preview: 'We need a quick update',
        body: 'Please reply when you can.',
        fromPreset: 'custom',
        replyTo: 'Ada@Example.com',
        fromName: 'Haybah',
    });
    assert.equal(parsed.subject, 'Follow up');
    assert.equal(parsed.preview, 'We need a quick update');
    assert.equal(parsed.replyTo, 'ada@example.com');
    assert.equal(parsed.fromPreset, 'custom');
    assert.equal(parsed.fromName, 'Haybah');
    assert.match(parsed.from, /^Haybah from Waraqah </);
});

test('listAdminMessageSenderOptions includes the three presets', () => {
    const ids = listAdminMessageSenderOptions().map((option) => option.id);
    assert.deepEqual(ids, ['noreply', 'support', 'custom']);
});

test('renderAdminMessageEmail wraps the body in the Waraqah layout', async () => {
    const { renderAdminMessageEmail } = await import('../src/emails/senders/adminMessageEmail.js');
    const { html, text } = await renderAdminMessageEmail({
        userName: 'Ada',
        preview: 'A quick note from Waraqah',
        body: 'Please confirm your billing details.\n\nThank you.',
    });
    assert.doesNotMatch(html, /Account follow-up/);
    assert.match(html, /Hi Ada/);
    assert.match(html, /Please confirm your billing details/);
    assert.match(html, /Waraqah/);
    assert.match(text, /Thank you/);
    assert.doesNotMatch(html, /no-reply address/);
});

test('renderAdminMessageEmail adds a no-reply notice when requested', async () => {
    const { renderAdminMessageEmail } = await import('../src/emails/senders/adminMessageEmail.js');
    const { html } = await renderAdminMessageEmail({
        userName: 'Ada',
        body: 'Thank you for following up.',
        noReply: true,
    });
    assert.match(html, /no-reply address/);
    assert.match(html, /not monitored/);
});

test('listAdminMessageActionOptions includes dashboard and custom', () => {
    const ids = listAdminMessageActionOptions().map((option) => option.id);
    assert.ok(ids.includes('none'));
    assert.ok(ids.includes('dashboard'));
    assert.ok(ids.includes('custom'));
});

test('resolveAdminMessageAction maps dashboard to the app home URL', () => {
    const previous = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://mywaraqah.com';
    try {
        const action = resolveAdminMessageAction('dashboard');
        assert.equal(action.actionUrl, 'https://mywaraqah.com');
        assert.equal(action.actionLabel, 'Go to dashboard');
    } finally {
        if (previous === undefined) delete process.env.FRONTEND_URL;
        else process.env.FRONTEND_URL = previous;
    }
});

test('resolveAdminMessageAction accepts a Waraqah path and rejects off-site links', () => {
    const previous = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://mywaraqah.com';
    try {
        const action = resolveAdminMessageAction('custom', '/invoices', 'See invoices');
        assert.equal(action.actionUrl, 'https://mywaraqah.com/invoices');
        assert.equal(action.actionLabel, 'See invoices');

        assert.throws(
            () => resolveAdminMessageAction('custom', 'https://evil.example/phish'),
            /Waraqah/i
        );
        assert.throws(
            () => resolveAdminMessageAction('custom'),
            /path or link/i
        );
    } finally {
        if (previous === undefined) delete process.env.FRONTEND_URL;
        else process.env.FRONTEND_URL = previous;
    }
});

test('parseAdminMessageInput includes a dashboard action by default as none', () => {
    const parsed = parseAdminMessageInput({
        subject: 'Follow up',
        body: 'Please reply when you can.',
    });
    assert.equal(parsed.actionPreset, 'none');
    assert.equal(parsed.actionUrl, '');
});

test('renderAdminMessageEmail includes an action button', async () => {
    const { renderAdminMessageEmail } = await import('../src/emails/senders/adminMessageEmail.js');
    const { html, text } = await renderAdminMessageEmail({
        userName: 'Ada',
        body: 'Your workspace is ready.',
        actionUrl: 'https://mywaraqah.com',
        actionLabel: 'Go to dashboard',
    });
    assert.match(html, /Go to dashboard/);
    assert.match(html, /https:\/\/mywaraqah\.com/);
    assert.match(text, /Go to dashboard/);
});
