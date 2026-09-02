import { createError, defineEventHandler, getQuery } from 'h3';
import { statusService } from '~/server/core/machines/service.js';
import { requireAuth } from '~/server/utils/permissions.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const query = getQuery(event);
  const entityType = query.entityType || query.type;
  const targetId = query.id || query.targetId;

  if (!entityType || !targetId) {
    throw createError({ statusCode: 400, message: 'entityType and id are required' });
  }

  return await statusService.getActions(entityType, targetId, {
    ...auth,
    ...(query.producerOutputId ? { producerOutputId: query.producerOutputId } : {})
  });
});
