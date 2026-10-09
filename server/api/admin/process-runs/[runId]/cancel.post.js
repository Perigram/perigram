import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { cancelProcessRun } from '~/server/features/process-definitions/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const body = await readBody(event).catch(() => ({}));
  return await cancelProcessRun(
    getRouterParam(event, 'runId'),
    { reason: body?.reason || '' },
    auth
  );
});
