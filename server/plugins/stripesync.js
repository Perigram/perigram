import { connectDB } from "../db/mongo";
import * as billingService from "../features/billing/service.js";
import logger from "../utils/logger";

const tag = "stripesync";

export default defineNitroPlugin(async (_) => {

    logger.info(`[${tag}] Stripe sync plugin start`);

    

    // Run in background

    (async () => {

        try {

            const db = await connectDB();

            await db

                .collection("organization_billing_payments")

                .updateMany({ status: "processing" }, { $set: { status: "created" } });



            logger.info(`[${tag}] Cleared processing organization billing payments`);



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
