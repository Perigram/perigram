import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as nestingRunsService from '~/server/features/nesting-runs/service';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const query = getQuery(event);

  return await nestingRunsService.list(
    auth.userId,
    auth.organizationId,
    auth.role,
    auth,
    query
  );
});
