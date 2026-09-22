import * as repository from './repository.js';
import { createError } from 'h3';
import { createIdentity } from '../../core/blocks/index.js';
import { hasLineagePermission, getLineageFilter } from '../../utils/permissions.js';
import { stateService, createTransitionAuth } from '../../core/machines/service.js';
import { EntityName } from './model.js';

/**
 * [EntityName] Service - v24 Standardized
 */

// Central Registration for Side-Effects

/**
 * Standard Get by ID
 */
export async function getById(uid, userId, userRole, userPermissions) {
  const raw = await repository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'Item not found' });
  
  const entity = new EntityName(raw);
  
  // Optional: Add permission check
  if (userPermissions && !hasLineagePermission(userPermissions, entity.lineage, 'feature_name', 'read')) {
    throw createError({ statusCode: 403, message: 'Access denied' });
  }

  return entity.toJSON();
}

/**
 * Standard List
 */
export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const lineageFilter = getLineageFilter(userPermissions);
  const finalFilter = { ...lineageFilter, ...filter };
  
  const raws = await repository.find(finalFilter);
  return raws.map(raw => new EntityName(raw).toJSON());
}

/**
 * Standard Create
 */
export async function create(data, userId, userOrg, userRole, userPermissions) {
  // 1. Lineage Building
  // const parent = await otherService.getById(data.parentId);
  // const lineage = inheritLineage(parent, 'parentType');
  const lineage = { organizationId: userOrg };

  // 2. Permission Check
  if (!hasLineagePermission(userPermissions, lineage, 'feature_name', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  // 3. Entity Construction
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

  // 4. Persistence
  const createdRaw = await repository.create(entity);
  return new EntityName(createdRaw).toJSON();
}

/**
 * Standard Status Transition
 */
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

/**
 * Side-Effect Implementation
 */
async function handleSideEffect({ targetId, userId }, params) {
  console.log(`[Feature Service] Handling side effect for ${targetId}`);
}
