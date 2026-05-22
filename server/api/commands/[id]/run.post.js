import { readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { executeCommand } from '~/server/core/commands/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const body = await readBody(event);
  const result = await executeCommand(event.context.params.id, body, auth);
  return {
    success: true,
    result
  };
});
