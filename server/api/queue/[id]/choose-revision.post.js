import { createError, defineEventHandler, readBody } from 'h3';
import * as queuesService from '~/server/features/queues/service.js';
import { requireAuth } from '~/server/utils/permissions.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const body = await readBody(event);
  if (!body?.revisionId) {
    throw createError({ statusCode: 400, message: 'revisionId is required' });
  }
  return await queuesService.selectNestingRevision(event.context.params.id, body.revisionId, auth);
});
