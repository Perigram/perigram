import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import * as nestingRunsService from '../../features/nesting-runs/service.js';
import { serializeManyForAccess } from '../../utils/entity-redaction.js';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const query = getQuery(event);

  const runs = await nestingRunsService.list(
    auth.userId,
    auth.organizationId,
    auth.role,
    auth,
    query
  );
  return serializeManyForAccess('nestingRun', runs, auth);
});
