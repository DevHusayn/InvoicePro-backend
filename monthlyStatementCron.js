import cron from 'node-cron';
import { sendMonthlyStatements } from './monthlyStatementAutomation.js';

cron.schedule('0 9 1 * *', async () => {
    try {
        const { processed, skipped } = await sendMonthlyStatements();
        console.log(
            `[Waraqah Email] Monthly statement automation ran. Sent ${processed}, skipped ${skipped}.`,
        );
    } catch (err) {
        console.error('[Waraqah Email] Monthly statement automation error:', err);
    }
});
