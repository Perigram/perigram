import { getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import '~/server/adapters/cnc-domain.js';
import { listServiceActionRuns } from '~/server/core/operations/service.js';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const query = getQuery(event);
  const runs = await listServiceActionRuns({
    actionId: query.actionId,
    limit: query.limit
  });
  return {
    success: true,
    runs
  };
});
