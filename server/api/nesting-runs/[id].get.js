import { defineEventHandler, getRouterParam } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import * as nestingRunsService from '../../features/nesting-runs/service.js';
import { serializeForAccess } from '../../utils/entity-redaction.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const run = await nestingRunsService.getById(
    getRouterParam(event, 'id'),
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );
  return serializeForAccess('nestingRun', run, auth);
});
