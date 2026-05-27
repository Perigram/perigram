import { requireAuth } from '~/server/utils/permissions';
import * as configBotService from '~/server/features/config-bot/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const session = await configBotService.getSession(event.context.params.id, auth);
  return {
    success: true,
    session
  };
});
