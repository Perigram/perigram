import { requireAuth } from '~/server/utils/permissions';
import * as configBotService from '~/server/features/config-bot/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const result = await configBotService.reindexKnowledge({}, auth);
  return {
    success: true,
    ...result
  };
});
