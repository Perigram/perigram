import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { serializeManyForAccess } from '~/server/utils/entity-redaction.js';
import * as revisionService from '~/server/features/instance-revisions/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const revisions = await revisionService.list(
    auth.userId,
    auth.organizationId,
    auth.role,
    auth,
    getQuery(event)
  );
  return serializeManyForAccess('entityRevision', revisions, auth);
});
