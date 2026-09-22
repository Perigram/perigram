import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as processDefinitionsService from '~/server/features/process-definitions/service.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const query = getQuery(event);
  return await processDefinitionsService.getActiveRelationOptions({
    actionId: decodeURIComponent(event.context.params.id),
    instanceId: query.instanceId,
    source: query.source === 'creator'
  }, auth);
});
