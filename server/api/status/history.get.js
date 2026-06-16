import { defineEventHandler, getQuery, createError } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import * as statusService from '../../features/statuses/service.js';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  
  const query = getQuery(event);
  const { targetId, targetType } = query;

  if (!targetId || !targetType) {
    throw createError({ statusCode: 400, message: 'targetId and targetType are required' });
  }

  return await statusService.getHistoryByTarget(targetType, targetId);
});
