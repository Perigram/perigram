import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as revisionService from '~/server/features/instance-revisions/service';
import { assertRevisionSourceReadable } from '~/server/utils/revision-access.js';

// Revision listing is constrained by each source entity's read grant;
// tenant filtering alone is not sufficient for restricted records.
export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const revisions = await revisionService.list(
    auth.userId,
    auth.organizationId,
    auth.role,
    auth,
    getQuery(event)
  );
  const readable = [];
  for (const revision of revisions) {
    try {
      await assertRevisionSourceReadable(revision, auth);
      readable.push(revision);
    } catch (error) {
      if ([403, 404].includes(error?.statusCode)) continue;
      throw error;
    }
  }
  return readable;
});
