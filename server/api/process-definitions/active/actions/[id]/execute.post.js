import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as processDefinitionsService from '~/server/features/process-definitions/service.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const body = await readBody(event);

  return await processDefinitionsService.executeActiveProcessAction({
    actionId: decodeURIComponent(event.context.params.id),
    instanceId: body?.instanceId,
    data: body?.data || {},
    parameters: body?.parameters || {},
    entities: body?.entities || {},
    targetOrganizationId: body?.targetOrganizationId || null,
    rerun: body?.rerun === true
  }, auth);
});
