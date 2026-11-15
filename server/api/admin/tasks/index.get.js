import { getQuery } from 'h3';
import { requireLineagePermission } from '~/server/utils/permissions';
import { listTaskDefinitions, listTaskRuns } from '~/server/core/tasks/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireLineagePermission(event, { organizationId: event.context.auth?.organizationId }, 'organizations', 'admin');
  const query = getQuery(event);
  const runs = await listTaskRuns({
    organizationId: auth.organizationId,
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
