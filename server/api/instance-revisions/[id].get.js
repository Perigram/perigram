import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { serializeForAccess } from '~/server/utils/entity-redaction.js';
import * as revisionService from '~/server/features/instance-revisions/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const revision = await revisionService.getById(
    event.context.params.id,
    auth.userId,
    auth.role,
    auth
  );
  return serializeForAccess('entityRevision', revision, auth);
});
