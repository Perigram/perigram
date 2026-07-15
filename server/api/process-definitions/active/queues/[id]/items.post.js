import { defineEventHandler, readBody, getRouterParam } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as processDefinitionsService from '~/server/features/process-definitions/service.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const body = await readBody(event);

  return await processDefinitionsService.appendExistingCassetteDesignToActiveQueue({
    queueId: getRouterParam(event, 'id'),
    designId: body?.designId,
    quantity: body?.quantity || 1
  }, auth);
});
