/**
 * PATCH /api/layer-standards/:id/pen
 * Set org-level pen override for a layer standard.
 * Body: { penId: string }
 */

import * as repository from '~/server/features/layer-standards/repository.js';

export default defineEventHandler(async (event) => {
  const organizationId = event.context.auth?.organizationId;
  if (!organizationId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const standardId = getRouterParam(event, 'id');
  const { penId } = await readBody(event);
  if (!penId) throw createError({ statusCode: 400, message: 'penId is required' });

  await repository.upsertOverride(organizationId, standardId, penId);
  return { success: true };
});
