import * as repository from './repository.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '../../utils/permissions.js';
import { generateRandomString } from '../../utils/strings.js';
import standardSlugify from 'standard-slugify';
import { createStatus } from '~/server/core/blocks/index.js';
import { Project } from './model.js';
import { createTransitionAuth, statusService } from '../../core/machines/service.js';
import { ObjectId } from 'mongodb';
import { toFlexibleId } from '../../utils/objectid.js';

/**
 * Projects Service - v24 Absolute Final
 */


export async function create(data, userId, userOrg, userRole, userPermissions) {
  if (userRole !== 'SuperAdmin' && !userOrg) {
    throw createError({ 
      statusCode: 400, 
      message: `Organization context required (Role: ${userRole})` 
    });
  }

  const name = data.name || 'Unnamed Project';
  const uid = `${standardSlugify(name, { keepCase: false })}-${generateRandomString(6)}`;

  const project = new Project({
    identity: { uid, name },
    lineage: { 
      organizationId: userRole === 'SuperAdmin' && data.organizationId ? toFlexibleId(data.organizationId) : toFlexibleId(userOrg)
    },
    data: {
      name,
      metadata: data.metadata || {}
    }
  });
  
  // Verify permissions
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, project.lineage, 'projects', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  project.applyStatus('DRAFT', userId, { note: 'Project created' });

  const createdRaw = await repository.create(project);
  return new Project(createdRaw);
}

export async function list(userId, userOrg, userRole, userPermissions) {
  const filter = getLineageFilter({ memberships: userPermissions.memberships, role: userRole });
  const raws = await repository.find(filter);
  return raws.map(raw => new Project(raw));
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
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, project.lineage, 'projects', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return project;
}

export async function update(uid, updates, userId, userOrg, userRole, userPermissions) {
  const project = await getBySlug(uid, userId, userOrg, userRole, userPermissions);
  
  if (updates.status) {
    await statusService.transition('project', project._id, updates.status, userId, createTransitionAuth(userId, userRole, userPermissions), updates.statusMeta || {});
    return await getById(uid);
  }

  const { identity, status, lineage, origin, data: updatesData, ...clean } = updates;
  
  project.data = {
    ...project.data,
    ...updatesData,
    ...clean
  };

  if (updates.name) project.identity.name = updates.name;

  await repository.updateById(project.id, project);
  const updatedRaw = await repository.findById(project.id);
  return new Project(updatedRaw);
}

export async function remove(uid, userId, userOrg, userRole, userPermissions) {
    const project = await getBySlug(uid, userId, userOrg, userRole, userPermissions);
    if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, project.lineage, 'projects', 'admin')) {
        throw createError({ statusCode: 403, message: 'Permission denied' });
    }
    return await repository.deleteById(uid);
}
