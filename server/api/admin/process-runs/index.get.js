import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { listProcessRuns } from '~/server/features/process-definitions/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const query = getQuery(event);
  return await listProcessRuns(auth, { limit: query.limit });
});
