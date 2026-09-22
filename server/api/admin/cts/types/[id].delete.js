import { requireAuth } from '~/server/utils/permissions';
import { removeType } from '~/server/features/cts-types/service.js';

// Removes an org-authored type declaration. System types (compiled from
// domain packs) are refused. A type with living instances or non-archived
// binding processes refuses with 409 + the blast radius; `?abandon=true`
// confirms the abandonment ceremony (SPEC §19).
export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const id = getRouterParam(event, 'id');
  const abandon = String(getQuery(event).abandon || '') === 'true';
  const result = await removeType(id, {
    organizationId: auth.organizationId,
    actor: auth.userId || null,
    abandon
  });
  return {
    success: result.removed,
    instances: result.instances,
    boundBy: result.boundBy,
    abandoned: result.abandoned
  };
});
