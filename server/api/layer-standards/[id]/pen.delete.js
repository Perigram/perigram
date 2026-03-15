/**
 * DELETE /api/layer-standards/:id/pen
 * Remove org-level pen override, reverting to system default.
 */

import { service } from '~/server/features/layer-standards';

export default defineEventHandler(async (event) => {
  const organizationId = event.context.auth?.organizationId;
  if (!organizationId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const standardId = getRouterParam(event, 'id');
  await service.removeOrgOverride(organizationId, standardId);
  return { success: true };
});
