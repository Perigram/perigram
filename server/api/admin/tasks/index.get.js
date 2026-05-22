import { getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { listTaskDefinitions, listTaskRuns } from '~/server/core/tasks/service.js';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const query = getQuery(event);
  const runs = await listTaskRuns({
    taskId: query.taskId,
    status: query.status,
    limit: query.limit
  });
  return {
    success: true,
    definitions: listTaskDefinitions(),
    runs
  };
});
