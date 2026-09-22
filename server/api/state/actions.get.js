import { createError, defineEventHandler, getQuery } from 'h3';
import { stateService } from '~/server/core/machines/service.js';
import { requireAuth } from '~/server/utils/permissions.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const query = getQuery(event);
  const typeId = query.typeId || query.type;
  const targetId = query.id || query.targetId;

  if (!typeId || !targetId) {
    throw createError({ statusCode: 400, message: 'typeId and id are required' });
  }

  return await stateService.getActions(typeId, targetId, {
    ...auth,
    ...(query.producerOutputId ? { producerOutputId: query.producerOutputId } : {})
  });
});
