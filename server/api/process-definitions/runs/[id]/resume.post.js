import { defineEventHandler, getRouterParam } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as service from '~/server/features/process-definitions/service.js';

export default defineEventHandler(async event => {
  return await service.resumeRun(getRouterParam(event, 'id'), requireAuth(event));
});
