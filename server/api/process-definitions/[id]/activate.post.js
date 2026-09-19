import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as service from '~/server/features/process-definitions/service.js';

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}));
  return await service.activate(getRouterParam(event, 'id'), requireAuth(event), body || {});
});
