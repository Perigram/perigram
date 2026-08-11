import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as service from '~/server/features/process-definitions/service.js';

export default defineEventHandler(async event => {
  return await service.startRun(
    getRouterParam(event, 'id'),
    await readBody(event),
    requireAuth(event)
  );
});
