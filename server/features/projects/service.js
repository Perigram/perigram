import * as repository from './repository.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { generateEntityName, generateRandomString } from '~/server/utils/strings';
import standardSlugify from 'standard-slugify';
import { createIdentity, createStatus, createSummary } from '~/server/utils/blocks';
import { statusService } from '~/server/core/machines/service';
import { ObjectId } from 'mongodb';

export async function create(data, userId, userOrg, userRole, userPermissions) {
  // Check permission for organization
  if (userRole !== 'SuperAdmin' && !userOrg) {
    throw createError({ statusCode: 400, message: 'Organization context required' });
  }

  const projectName = data.name || generateEntityName();
  const slug = `${standardSlugify(projectName, { keepCase: false })}-${generateRandomString(6)}`;

  const origin = createStatus('DRAFT', userId, { note: 'Initial project creation' });
  
  const projectData = {
    identity: createIdentity(projectName, slug),
    origin: origin,
    status: origin,
    lineage: { 
      organizationId: userRole === 'SuperAdmin' && data.organizationId ? new ObjectId(data.organizationId) : new ObjectId(userOrg) 
    },
    summary: createSummary(),
    metadata: data.metadata || {}
  };
  
  // Verify permissions for the target organization
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, projectData.lineage, 'projects', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  return await repository.create(projectData);
}

export async function list(userId, userOrg, userRole, userPermissions) {
  const filter = getLineageFilter({ memberships: userPermissions.memberships, role: userRole });
  return await repository.find(filter);
}

export async function getBySlug(slug, userId, userOrg, userRole, userPermissions) {
  const project = await repository.findBySlug(slug);
  if (!project) {
    throw createError({ statusCode: 404, message: 'Project not found' });
  }
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, project.lineage, 'projects', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return project;
}

export async function update(slug, updates, userId, userOrg, userRole, userPermissions) {
  const project = await getBySlug(slug, userId, userOrg, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, project.lineage, 'projects', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  // Identity updates
  if (updates.name) {
    project.identity.name = updates.name;
  }
  
  // Status updates must go through statusService
  if (updates.status) {
    await statusService.transition('project', project._id, updates.status, userId, userRole, updates.statusMeta || {});
    delete updates.status;
  }

  const { identity, status, lineage, origin, ...clean } = updates;
  await repository.updateBySlug(slug, { identity: project.identity, ...clean });
  
  return await repository.findBySlug(slug);
}

export async function remove(slug, userId, userOrg, userRole, userPermissions) {
    const project = await getBySlug(slug, userId, userOrg, userRole, userPermissions);
    
    if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, project.lineage, 'projects', 'admin')) {
        throw createError({ statusCode: 403, message: 'Permission denied' });
    }
    
    return await repository.deleteBySlug(slug);
}
