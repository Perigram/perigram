import { requireAuth } from '~/server/utils/permissions';
import { defineType } from '~/server/features/cts-types/service.js';

// Author or compatibly evolve an org-scoped type declaration. The CTS
// registry validates the declaration, refuses breaking diffs (SPEC §11),
// and compiles the whole org view before the write is acknowledged.
export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const body = await readBody(event);
  if (!body?.id) {
    throw createError({ statusCode: 400, message: 'Type declaration requires id' });
  }
  const stored = await defineType(body, { organizationId: auth.organizationId });
  return { success: true, type: stored };
});
