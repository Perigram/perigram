/**
 * DELETE /api/layer-standards/:id/pen
 * Remove org-level pen override, reverting to system default.
 */

import * as repository from '~/server/features/layer-standards/repository.js';

export default defineEventHandler(async (event) => {
  const organizationId = event.context.auth?.organizationId;
  if (!organizationId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const standardId = getRouterParam(event, 'id');
  await repository.deleteOverride(organizationId, standardId);
  return { success: true };
});
