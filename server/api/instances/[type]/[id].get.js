import { requireAuth } from '~/server/utils/permissions';
import { assertEntityAccess } from '~/server/core/access/service.js';
import { declarationForType, writeGrantTarget } from '~/server/features/instances/service.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';

// Generic instance read transport (SPEC §13): single instance by id through
// the same entity-service boundary the process evaluator uses.
export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const typeId = getRouterParam(event, 'type');
  const id = getRouterParam(event, 'id');
  if (!typeId || !id) {
    throw createError({ statusCode: 400, statusMessage: 'type and id are required' });
  }
  const registry = getAppRegistry();
  const service = registry.getInstanceService(typeId);
  if (!service?.processGetById) {
    throw createError({ statusCode: 404, statusMessage: `no instance service for type ${typeId}` });
  }
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  const item = await service.processGetById(id, { auth, userId: auth.userId, organizationId });
  if (!item) {
    throw createError({ statusCode: 404, statusMessage: `${typeId} ${id} not found` });
  }
  const declaration = await declarationForType(typeId, organizationId);
  if (!declaration) throw createError({ statusCode: 404, message: `no declaration for type ${typeId}` });
  const target = await writeGrantTarget(declaration, organizationId);
  if (!target) throw createError({ statusCode: 403, message: 'Permission denied' });
  const entity = item?.toJSON ? item.toJSON() : item;
  assertEntityAccess({ entity, typeId, feature: target.feature, level: 'read', auth });
  return item;
});
