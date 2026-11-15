import { getQuery } from 'h3';
import { requireLineagePermission } from '~/server/utils/permissions';
import { listCommandRuns } from '~/server/core/commands/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireLineagePermission(event, { organizationId: event.context.auth?.organizationId }, 'organizations', 'admin');
  const query = getQuery(event);
  const runs = await listCommandRuns({
    organizationId: auth.organizationId,
    commandId: query.commandId,
    limit: query.limit
  });
  return {
    success: true,
    runs
  };
});
