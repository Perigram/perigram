import { createError, defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as entityEventService from '~/server/features/entity-events/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const body = await readBody(event);
  const type = body?.type || body?.typeId;
  const id = body?.id || body?.targetId;

  if (!type || !id) {
    throw createError({ statusCode: 400, message: 'type and id are required' });
  }

  return await entityEventService.publishEntityChanged(auth, {
    type,
    id,
    change: body.change || 'updated',
    reason: body.reason || body.change || 'updated',
    source: 'client'
  });
});
