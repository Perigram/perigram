import { requireAuth } from '~/server/utils/permissions';
import { removeType } from '~/server/features/cts-types/service.js';

// Removes an org-authored type declaration. System types (compiled from
// domain packs) are refused.
export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const id = getRouterParam(event, 'id');
  const removed = await removeType(id, { organizationId: auth.organizationId });
  return { success: removed };
});
