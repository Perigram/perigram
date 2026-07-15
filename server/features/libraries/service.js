import { ObjectId } from 'mongodb';
import { createError } from 'h3';
import * as repository from './repository.js';
import { Library } from './model.js';
import { createData, createIdentity } from '~/server/core/blocks/index.js';
import { statusService, createTransitionAuth } from '~/server/core/machines/service';
import { getLineageFilter, hasLineagePermission } from '~/server/utils/permissions';
import { mapLineageQuery } from '~/server/utils/query';

function toDTO(library) {
  if (!library) return null;
  return new Library(library).toJSON();
}

export async function create(data = {}, userId, userOrg, userRole, userPermissions) {
  const organizationId = data.organizationId || userOrg;
  if (!organizationId) throw createError({ statusCode: 400, message: 'Organization context required' });

  const lineage = { organizationId };
  if (!hasLineagePermission(userPermissions, lineage, 'libraries', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied for libraries' });
  }

  const origin = await statusService.initialStatusForOrganization('library', organizationId, userId, { note: 'Library created' });
  const library = new Library({
    identity: createIdentity(data.name || 'New Library', data.slug || `library-${new ObjectId().toString().slice(0, 8)}`),
    origin,
    status: origin,
    lineage,
    data: createData({
      material: data.material || data.data?.material || null,
      description: data.description || data.data?.description || ''
    }),
    summary: { cassetteCount: 0 }
  });

  const created = await repository.create(library.toJSON());
  return toDTO(created);
}

export async function getById(id, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Library not found' });
  const library = new Library(raw).toJSON();
  if (!hasLineagePermission(userPermissions, library, 'libraries', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied for libraries' });
  }
  return library;
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const { limit, skip, status, primaryStatus, primaryStatuses, ...rest } = filter;
  const finalFilter = mapLineageQuery({ ...getLineageFilter(userPermissions), ...rest });
  const statuses = normalizePrimaryStatuses(primaryStatuses);
  if (statuses.length) finalFilter['status.state.primary'] = { $in: statuses };
  else if (status || primaryStatus) finalFilter['status.state.primary'] = status || primaryStatus;

  const raws = await repository.find(finalFilter, { limit, skip });
  return raws
    .map(toDTO)
    .filter(library => hasLineagePermission(userPermissions, library, 'libraries', 'read'));
}

export async function update(id, updates = {}, userId, userOrg, userRole, userPermissions) {
  const current = await getById(id, userId, userOrg, userRole, userPermissions);
  if (!hasLineagePermission(userPermissions, current, 'libraries', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied for libraries' });
  }

  if (updates.status && typeof updates.status === 'string') {
    await statusService.transition('library', current._id, updates.status, userId, createTransitionAuth(userId, userRole, userPermissions), updates.statusMeta || {});
    return await getById(id, userId, userOrg, userRole, userPermissions);
  }

  const library = new Library(current);
  if (updates.name) library.identity.name = updates.name;
  library.data = {
    ...(library.data || {}),
    ...(updates.data || {}),
    ...(updates.material !== undefined ? { material: updates.material } : {}),
    ...(updates.description !== undefined ? { description: updates.description } : {})
  };

  const updated = await repository.updateById(id, library.toJSON());
  return toDTO(updated);
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  const library = await getById(id, userId, userOrg, userRole, userPermissions);
  if (!hasLineagePermission(userPermissions, library, 'libraries', 'admin', { action: 'delete' })) {
    throw createError({ statusCode: 403, message: 'Permission denied for libraries' });
  }
  return await repository.deleteById(id);
}

function normalizePrimaryStatuses(value) {
  if (Array.isArray(value)) return value.flatMap(normalizePrimaryStatuses);
  if (typeof value !== 'string') return [];
  return value.split(',').map(item => item.trim()).filter(Boolean);
}
