import { connectDB } from "../db/mongo";
import logger from "../utils/logger";
import { sendNestFinishEmail } from "../features/notification/sendEmail";
import { updateProjectStatistics } from "../features/nesting/statistics.js";

export default defineNitroPlugin(async (nitroApp) => {
  logger.info("Nest notify plugin start");
  
  // Run in background
  (async () => {
    try {
      const db = await connectDB();

      while (true) {
        try {
          const result = await db.collection('nesting_jobs').findOneAndUpdate(
            {
              status: 'done',
              emailNotify: 'need_notify',
            }, {
            $set: {
              emailNotify: 'notification_in_progress',
            }
          }, {
            returnDocument: 'after',
          })

          if (result) {
            await updateProjectStatistics(result.projectSlug, result);
            try {
              await sendNestFinishEmail(result);
              await db.collection('nesting_jobs').updateOne(
                { _id: result._id },
                { $set: { emailNotify: 'notification_sent' } }
              );
            } catch (error) {
              await db.collection('nesting_jobs').updateOne(
                { _id: result._id },
                { $set: { emailNotify: 'error_notify' } }
              );
              logger.error('Error in sendNestFinishEmail:', error);
            }
          } else {
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        } catch (error) {
          logger.error('Error in nest-notify loop step:', error);
        }
      }
    } catch (err) {
      logger.error('Error in nest-notify plugin initialization:', err);
    }
  })();
});
