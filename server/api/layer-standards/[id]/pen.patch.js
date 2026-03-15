/**
 * PATCH /api/layer-standards/:id/pen
 * Set org-level pen override for a layer standard.
 * Body: { penId: string }
 */

import { service } from '~/server/features/layer-standards';

export default defineEventHandler(async (event) => {
  const organizationId = event.context.auth?.organizationId;
  if (!organizationId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const standardId = getRouterParam(event, 'id');
  const { penId } = await readBody(event);
  if (!penId) throw createError({ statusCode: 400, message: 'penId is required' });

  await service.setOrgOverride(organizationId, standardId, penId);
  return { success: true };
});
