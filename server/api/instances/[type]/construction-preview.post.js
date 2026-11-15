import { createError, defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { previewConstructionService } from '~/server/features/instances/construction-services.js';
import { declarationForType, writeGrantTarget } from '~/server/features/instances/service.js';
import { hasInstanceAccess } from '~/server/core/access/service.js';

// The fill dialog's composed preview (SPEC §24): the create's own
// construction service over `{ mode, draft }`, persisting nothing. The
// write gate mirrors the create transport — a preview runs the same
// compute the gated create would.
export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const typeId = getRouterParam(event, 'type');
  const body = await readBody(event);
  const mode = String(body?.mode || '');
  if (!typeId || !mode) {
    throw createError({ statusCode: 400, statusMessage: 'type and mode are required' });
  }
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  const declaration = await declarationForType(typeId, organizationId);
  const target = await writeGrantTarget(declaration, organizationId);
  if (!target || !hasInstanceAccess({ entity: null, typeId: target.typeId, feature: target.feature, level: 'write', auth })) {
    throw createError({ statusCode: 403, statusMessage: 'Permission denied' });
  }
  return await previewConstructionService(typeId, mode, body?.draft || {}, {
    userId: auth.userId,
    organizationId,
    role: auth.role,
    auth
  }).then(result => {
    // An unbound mode is a quiet nothing-to-preview, never a failed read.
    if (result) return result;
    setResponseStatus(event, 204);
    return null;
  });
});
