import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as revisionService from '~/server/features/instance-revisions/service';
import { assertRevisionSourceReadable } from '~/server/utils/revision-access.js';

// Revision visibility is bounded by both the revision's tenant and the
// source entity's compiled read grant.
export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const revision = await revisionService.getById(
    event.context.params.id,
    auth.userId,
    auth.role,
    auth
  );
  await assertRevisionSourceReadable(revision, auth);
  return revision;
});
