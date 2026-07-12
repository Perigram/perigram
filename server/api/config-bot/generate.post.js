import { readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as configBotService from '~/server/features/config-bot/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const body = await readBody(event);
  const result = await configBotService.generateDraft(body, auth);
  return {
    success: true,
    ...result
  };
});
