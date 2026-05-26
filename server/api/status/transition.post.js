import { createError, defineEventHandler, readBody } from 'h3';
import { statusService } from '~/server/core/machines/service.js';
import { requireAuth } from '~/server/utils/permissions.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const body = await readBody(event);
  const entityType = body?.entityType || body?.type;
  const targetId = body?.id || body?.targetId;
  const targetState = body?.status || body?.state;

  if (!entityType || !targetId || !targetState) {
    throw createError({ statusCode: 400, message: 'entityType, id, and status are required' });
  }

  return await statusService.transitionWithResult({
    entityType,
    targetId,
    targetState,
    auth,
    context: body.statusMeta || body.context || {}
  });
});
