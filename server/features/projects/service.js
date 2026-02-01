import * as repository from './repository.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { generateRandomString } from '~/server/utils/strings';
import standardSlugify from 'standard-slugify';
import { createStatus, registerService } from '~/server/utils/blocks';
import { Project } from './model.js';
import { statusService } from '~/server/core/machines/service';
import { ObjectId } from 'mongodb';

/**
 * Projects Service - v24 Absolute Final
 */

// Register for procedural drilling
registerService('project', {
  getById: (uid) => getById(uid)
});

export async function create(data, userId, userOrg, userRole, userPermissions) {
  if (userRole !== 'SuperAdmin' && !userOrg) {
    throw createError({ statusCode: 400, message: 'Organization context required' });
  }

  const name = data.name || 'Unnamed Project';
  const uid = `${standardSlugify(name, { keepCase: false })}-${generateRandomString(6)}`;

  const project = new Project({
    identity: { uid },
    lineage: { 
      organizationId: userRole === 'SuperAdmin' && data.organizationId ? data.organizationId : userOrg 
    },
    name, // Passed to constructor for data block
    data: {
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
  const raw = await repository.findById(uid);
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
    await statusService.transition('project', project._id, updates.status, userId, userRole, updates.statusMeta || {});
    return await getById(uid);
  }

  const { identity, status, lineage, origin, data: updatesData, ...clean } = updates;
  
  project.data = {
    ...project.data,
    ...updatesData,
    ...clean
  };

  if (updates.name) project.data.name = updates.name;

  await repository.updateById(uid, project);
  const updatedRaw = await repository.findById(uid);
  return new Project(updatedRaw);
}

export async function remove(uid, userId, userOrg, userRole, userPermissions) {
    const project = await getBySlug(uid, userId, userOrg, userRole, userPermissions);
    if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, project.lineage, 'projects', 'admin')) {
        throw createError({ statusCode: 403, message: 'Permission denied' });
    }
    return await repository.deleteById(uid);
}