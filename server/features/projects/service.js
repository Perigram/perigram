import * as repository from './repository.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '../../utils/permissions.js';
import { generateRandomString } from '../../utils/strings.js';
import standardSlugify from 'standard-slugify';
import { normalizeEntityRef, Relations } from '~/packages/core/src/index.js';
import { Project } from './model.js';
import { createTransitionAuth, statusService } from '../../core/machines/service.js';
import { toFlexibleId } from '../../utils/objectid.js';
import * as librariesService from '../libraries/service.js';
import * as entityRevisionsService from '../entity-revisions/service.js';

/**
 * Projects Service - v24 Absolute Final
 */


export async function create(data, userId, userOrg, userRole, userPermissions) {
  const organizationId = data.organizationId || userOrg;
  if (!organizationId) {
    throw createError({ 
      statusCode: 400, 
      message: 'Organization context required'
    });
  }

  const name = data.name || 'Unnamed Project';
  const uid = `${standardSlugify(name, { keepCase: false })}-${generateRandomString(6)}`;

  const project = new Project({
    identity: { uid, name },
    lineage: { 
      organizationId: toFlexibleId(organizationId)
    },
    data: {
      name,
      metadata: data.metadata || {}
    },
    relations: await normalizeProjectRelations(data.relations, userId, userOrg, userRole, userPermissions)
  });
  
  // Verify permissions
  if (!hasLineagePermission(userPermissions, project, 'projects', 'write', { action: 'create' })) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const initialStatus = await statusService.initialStatusForOrganization('project', organizationId, userId, { note: 'Project created' });
  project.origin = initialStatus;
  project.status = initialStatus;

  const createdRaw = await repository.create(project);
  return new Project(createdRaw);
}

export async function list(userId, userOrg, userRole, userPermissions, query = {}) {
  const filter = {
    ...getLineageFilter(userPermissions)
  };
  const primaryStatuses = normalizePrimaryStatuses(query.primaryStatuses);
  if (primaryStatuses.length) filter['status.state.primary'] = { $in: primaryStatuses };
  else if (query.status || query.primaryStatus) filter['status.state.primary'] = query.status || query.primaryStatus;
  const raws = await repository.find(filter);
  return raws
    .map(raw => new Project(raw))
    .filter(project => hasLineagePermission(userPermissions, project, 'projects', 'read'));
}

function normalizePrimaryStatuses(value) {
  if (Array.isArray(value)) return value.flatMap(normalizePrimaryStatuses);
  if (typeof value !== 'string') return [];
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

export async function getById(uid) {
  const raw = await repository.findById(toFlexibleId(uid));
  if (!raw) return null;
  return new Project(raw);
}

export async function getBySlug(uid, userId, userOrg, userRole, userPermissions) {
  const project = await getById(uid);
  if (!project) {
    throw createError({ statusCode: 404, message: 'Project not found' });
  }
  
  if (!hasLineagePermission(userPermissions, project, 'projects', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return project;
}

export async function update(uid, updates, userId, userOrg, userRole, userPermissions) {
  const project = await getBySlug(uid, userId, userOrg, userRole, userPermissions);
  if (!hasLineagePermission(userPermissions, project, 'projects', 'write', { action: 'edit' })) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  if (updates.status) {
    await statusService.transition('project', project._id, updates.status, userId, createTransitionAuth(userId, userRole, userPermissions), updates.statusMeta || {});
    return await getById(uid);
  }

  const { identity, status, lineage, relations, provenance, origin, summary, data: updatesData, ...clean } = updates;
  
  project.data = {
    ...project.data,
    ...updatesData,
    ...clean
  };

  if (updates.name) project.identity.name = updates.name;
  if (relations !== undefined) {
    project.relations = new Relations(await normalizeProjectRelations(
      relations,
      userId,
      userOrg,
      userRole,
      userPermissions,
      project.relations?.toJSON?.() || project.relations || {}
    ));
  }

  await repository.updateById(project.id, project);
  const updatedRaw = await repository.findById(project.id);
  return new Project(updatedRaw);
}

async function normalizeProjectRelations(relations, userId, userOrg, userRole, userPermissions, existing = {}) {
  if (relations === undefined) return existing;
  const requested = relations?.cassetteLibraries;
  if (requested === undefined) return existing;
  const values = Array.isArray(requested) ? requested : [requested].filter(Boolean);
  const refs = [];
  for (const value of values) {
    const ref = normalizeEntityRef(typeof value === 'object' ? value : { type: 'library', id: value });
    if (!ref || ref.type !== 'library') {
      throw createError({ statusCode: 400, message: 'Project cassetteLibraries must contain library EntityRefs' });
    }
    const library = await librariesService.getById(ref.id, userId, userOrg, userRole, userPermissions);
    if (!library) throw createError({ statusCode: 404, message: 'Cassette library not found' });
    if (ref.revisionId) {
      const revision = await entityRevisionsService.getById(ref.revisionId, userId, userRole, userPermissions);
      const source = revision?.data?.source;
      if (source?.type !== 'library' || String(source?.id) !== String(ref.id)) {
        throw createError({ statusCode: 400, message: 'Pinned revision does not belong to the selected library' });
      }
    }
    refs.push(ref);
  }
  return {
    ...existing,
    cassetteLibraries: Array.from(new Map(refs.map(ref => [`${ref.type}:${ref.id}:${ref.revisionId || ''}`, ref])).values())
  };
}

export async function remove(uid, userId, userOrg, userRole, userPermissions) {
    const project = await getBySlug(uid, userId, userOrg, userRole, userPermissions);
    if (!hasLineagePermission(userPermissions, project, 'projects', 'admin')) {
        throw createError({ statusCode: 403, message: 'Permission denied' });
    }
    return await repository.deleteById(uid);
}
