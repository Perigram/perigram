import { createError, defineEventHandler, getRouterParam, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { declarationForType, writeGrantTarget } from '~/server/features/instances/service.js';
import { hasInstanceAccess } from '~/server/core/access/service.js';

// Generic instance construct transport (surface contract 5): runs a
// declared construction mode through its handler — the standard
// protocols and the service-backed modes alike — under the same write
// gate the create transport takes. The body carries `{ mode, draft }`.
export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const typeId = getRouterParam(event, 'type');
  const body = await readBody(event);
  const mode = String(body?.mode || '');
  if (!typeId || !mode) {
    throw createError({ statusCode: 400, statusMessage: 'type and mode are required' });
  }
  const service = getAppRegistry().getInstanceService(typeId);
  if (!service || typeof service.constructionHandlers?.[mode] !== 'function') {
    throw createError({ statusCode: 404, statusMessage: `no construction mode ${mode} for type ${typeId}` });
  }
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  const declaration = await declarationForType(typeId, organizationId);
  const target = await writeGrantTarget(declaration, organizationId);
  if (!target || !hasInstanceAccess({ entity: null, typeId: target.typeId, feature: target.feature, level: 'write', auth })) {
    throw createError({ statusCode: 403, statusMessage: 'Permission denied' });
  }
  return await service.constructionHandlers[mode](body?.draft || {}, {
    userId: auth.userId,
    organizationId,
    role: auth.role,
    auth
  });
});
