import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as processDefinitionsService from '~/server/features/process-definitions/service.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const body = await readBody(event);

  return await processDefinitionsService.assignUserToActiveProcess({
    userId: body.userId,
    roleIds: body.roleIds,
    bindings: body.bindings,
    status: body.status || 'active'
  }, auth);
});
