import * as billingService from '../features/billing/service.js';
import logger from '../utils/logger';

const tag = 'stripesync';

export default defineNitroPlugin(async (_) => {
    logger.info(`[${tag}] Stripe sync plugin start`);

    (async () => {
        try {
            await billingService.resetInterruptedPayments();
            logger.info(`[${tag}] Reset interrupted organization billing payments`);

            while (true) {
                const payment = await billingService.syncNextPendingPayment();
                if (payment) {
                    logger.info(`[${tag}] Synced organization billing payment`, { paymentId: payment._id, status: payment.status });
                } else {
                    await new Promise((resolve) => setTimeout(resolve, 30 * 1000));
                }
            }
        } catch (error) {
            logger.error(`[${tag}] Error in stripe sync loop:`, error);
        }
    })();
});
