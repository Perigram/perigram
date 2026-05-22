import { getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { listProcessDefinitions, listProcessRuns } from '~/server/core/processes/service.js';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const query = getQuery(event);
  const runs = await listProcessRuns({
    processId: query.processId,
    status: query.status,
    limit: query.limit
  });
  return {
    success: true,
    definitions: listProcessDefinitions(),
    runs
  };
});
