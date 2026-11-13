import * as repository from './repository.js';
import { createError } from 'h3';
import { createIdentity } from '../../core/blocks/index.js';
import { hasLineagePermission, getLineageFilter } from '../../utils/permissions.js';
import { stateService, createTransitionAuth } from '../../core/machines/service.js';
import { EntityName } from './model.js';


export async function getById(uid, userId, userRole, userPermissions) {
  const raw = await repository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'Item not found' });

  const entity = new EntityName(raw);

  if (userPermissions && !hasLineagePermission(userPermissions, entity.lineage, 'feature_name', 'read')) {
    throw createError({ statusCode: 403, message: 'Access denied' });
  }

  return entity.toJSON();
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const lineageFilter = getLineageFilter(userPermissions);
  const finalFilter = { ...lineageFilter, ...filter };

  const raws = await repository.find(finalFilter);
  return raws.map(raw => new EntityName(raw).toJSON());
}

export async function create(data, userId, userOrg, userRole, userPermissions) {
  const lineage = { organizationId: userOrg };

  if (!hasLineagePermission(userPermissions, lineage, 'feature_name', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const origin = await stateService.initialStatusForOrganization(
    'feature_name',
    lineage.organizationId,
    userId,
    { note: 'Initial creation' }
  );
  const entity = new EntityName({
    identity: createIdentity(data.name, data.slug),
    lineage,
    origin,
    status: origin,
    data: { customField: data.customField }
  });

  const createdRaw = await repository.create(entity);
  return new EntityName(createdRaw).toJSON();
}

export async function updateStatus(id, newState, userId, userRole, metadata = {}) {
  const result = await stateService.transitionWithResult({
    typeId: 'feature_name',
    targetId: id,
    targetState: newState,
    auth: createTransitionAuth(userId, userRole),
    context: metadata
  });
  return result.status;
}

