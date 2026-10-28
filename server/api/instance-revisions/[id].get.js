import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as revisionService from '~/server/features/instance-revisions/service';

// One revision DTO; the service owns the read scope (the source records'
// org-scope law) and the DTO serializes like the records — the stored
// document verbatim.
export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  return await revisionService.getById(
    event.context.params.id,
    auth.userId,
    auth.role,
    auth
  );
});
