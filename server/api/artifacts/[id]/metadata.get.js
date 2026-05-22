import { defineEventHandler, getRouterParam } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { service } from '~/server/features/artifacts';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  return await service.getById(getRouterParam(event, 'id'));
});
