import cron from 'node-cron';
import { sendDuePaymentReminders } from './paymentReminderAutomation.js';

cron.schedule('0 9 * * *', async () => {
    try {
        const { processed } = await sendDuePaymentReminders();
        console.log(`[Waraqah Email] Payment reminder automation ran. Sent ${processed} reminders.`);
    } catch (err) {
        console.error('[Waraqah Email] Payment reminder automation error:', err);
    }
});
