import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as processDefinitionsService from '~/server/features/process-definitions/service.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const body = await readBody(event);

  return await processDefinitionsService.executeActiveProcessAction({
    actionId: event.context.params.id,
    entityId: body?.entityId,
    data: body?.data || {},
    parameters: body?.parameters || {},
    entities: body?.entities || {},
    targetOrganizationId: body?.targetOrganizationId || null
  }, auth);
});
