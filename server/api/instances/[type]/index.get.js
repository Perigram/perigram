import { requireAuth } from '~/server/utils/permissions';
import { hasInstanceAccess } from '~/server/core/access/service.js';
import { declarationForType, writeGrantTarget } from '~/server/features/instances/service.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';

// Generic instance list transport (SPEC §13): the HTTP surface the legacy
// entity API deletion left missing. One route serves every type that
// resolves through the generic instance services; explicit framework
// services keep their feature-owned routes.
export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const typeId = getRouterParam(event, 'type');
  if (!typeId) {
    throw createError({ statusCode: 400, statusMessage: 'type is required' });
  }
  const registry = getAppRegistry();
  const service = registry.getInstanceService(typeId);
  if (!service?.processList) {
    throw createError({ statusCode: 404, statusMessage: `no instance service for type ${typeId}` });
  }
  const query = getQuery(event);
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  // processList takes ONE context object (userId + organizationId ride on
  // it) — passing them positionally resolved declarations with no org and
  // 404'd every org-authored type on list loads.
  const declaration = await declarationForType(typeId, organizationId);
  if (!declaration) throw createError({ statusCode: 404, statusMessage: `no declaration for type ${typeId}` });
  const target = await writeGrantTarget(declaration, organizationId);
  if (!target) throw createError({ statusCode: 403, statusMessage: 'Permission denied' });
  const items = await service.processList(query, { auth, userId: auth.userId, organizationId });
  return (items || []).filter(item => hasInstanceAccess({
    entity: item?.toJSON ? item.toJSON() : item,
    typeId: target.typeId,
    feature: target.feature,
    level: 'read',
    action: 'view',
    auth
  }));
});
