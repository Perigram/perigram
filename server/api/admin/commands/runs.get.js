import { getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { listCommandRuns } from '~/server/core/commands/service.js';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const query = getQuery(event);
  const runs = await listCommandRuns({
    commandId: query.commandId,
    limit: query.limit
  });
  return {
    success: true,
    runs
  };
});
