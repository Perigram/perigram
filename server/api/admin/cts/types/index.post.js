import { requireLineagePermission } from '~/server/utils/permissions';
import { defineType } from '~/server/features/cts-types/service.js';

// Author or evolve an org-scoped type declaration. The CTS registry
// validates the declaration, gates breaking diffs on covering `migrate`
// steps (SPEC §11), and compiles the whole org view before the write is
// acknowledged; covered steps execute against instances before returning.
export default defineEventHandler(async (event) => {
  const auth = requireLineagePermission(event, { organizationId: event.context.auth?.organizationId }, 'organizations', 'admin');
  const body = await readBody(event);
  if (!body?.id) {
    throw createError({ statusCode: 400, message: 'Type declaration requires id' });
  }
  const stored = await defineType(body, { organizationId: auth.organizationId, actor: auth.userId });
  return { success: true, type: stored };
});
