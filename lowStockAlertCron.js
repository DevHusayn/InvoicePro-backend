import cron from 'node-cron';
import { sendLowStockDigests } from './lowStockAlertAutomation.js';

cron.schedule('0 8 * * *', async () => {
    try {
        const { processed, skipped } = await sendLowStockDigests();
        console.log(
            `[Waraqah Email] Low stock digest automation ran. Sent ${processed}, skipped ${skipped}.`,
        );
    } catch (err) {
        console.error('[Waraqah Email] Low stock digest automation error:', err);
    }
});
