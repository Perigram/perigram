import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as revisionService from '~/server/features/entity-revisions/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  return await revisionService.list(
    auth.userId,
    auth.organizationId,
    auth.role,
    auth,
    getQuery(event)
  );
});
