import * as repository from './repository.js';
import { createError } from 'h3';
import { hasPermission } from '~/server/utils/auth-helpers';
import { generateEntityName, generateRandomString } from '~/server/utils/strings';
import standardSlugify from 'standard-slugify';

export async function create(data, userId, userOrg, userPermissions) {
  // Check permission
  if (!hasPermission({ permissions: userPermissions }, 'projects', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const projectName = data.name || generateEntityName();
  const projectSlug = `${standardSlugify(projectName, {
    keepCase: false,
  })}-${generateRandomString(6)}`;

  const projectData = {
    slug: projectSlug,
    name: projectName,
    ownerId: userId, // Creator
    contractorId: userOrg, // Organization ownership
    status: "ACTIVE",
    batchIds: [],
    queueIds: [],
    metadata: {
      custom: {}
    },
    tep: {
      materialCostPerSqM: 0,
      laborCostPerHour: 0,
      totalEstimate: 0
    },
    statistics: {
      totalCassettes: 0,
      totalArea: 0,
      completedBatches: 0
    },
    ...data
  };
  
  return await repository.create(projectData);
}

export async function list(userId, userOrg, userRole, userPermissions) {
  if (!hasPermission({ permissions: userPermissions }, 'projects', 'read')) {
    return [];
  }
  
  const filter = {};
  
  // SuperAdmin sees all
  if (userRole === 'SuperAdmin') {
    return await repository.find(filter);
  }
  
  // Others see only projects in their org
  // We also support legacy projects where contractorId might be missing but ownerId matches
  if (userOrg) {
      filter.$or = [
          { contractorId: userOrg },
          { ownerId: userId } // For personal/legacy projects
      ];
  } else {
      filter.ownerId = userId;
  }
  
  return await repository.find(filter);
}

export async function getBySlug(slug, userId, userOrg, userRole, userPermissions) {
  if (!hasPermission({ permissions: userPermissions }, 'projects', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  const project = await repository.findBySlug(slug);
  if (!project) {
    throw createError({ statusCode: 404, message: 'Project not found' });
  }
  
  // Check ownership
  if (userRole !== 'SuperAdmin') {
      const isOrgMatch = project.contractorId && userOrg && project.contractorId.toString() === userOrg.toString();
      const isOwnerMatch = project.ownerId && project.ownerId.toString() === userId.toString();
      
      if (!isOrgMatch && !isOwnerMatch) {
        throw createError({ statusCode: 403, message: 'Not your project' });
      }
  }
  
  return project;
}

export async function update(slug, updates, userId, userOrg, userRole, userPermissions) {
  await getBySlug(slug, userId, userOrg, userRole, userPermissions);
  
  if (!hasPermission({ permissions: userPermissions }, 'projects', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  await repository.updateBySlug(slug, updates);
  return await repository.findBySlug(slug);
}

export async function remove(slug, userId, userOrg, userRole, userPermissions) {
    await getBySlug(slug, userId, userOrg, userRole, userPermissions);
    
    if (!hasPermission({ permissions: userPermissions }, 'projects', 'admin')) { // Deletion might require admin level
        throw createError({ statusCode: 403, message: 'Permission denied' });
    }
    
    return await repository.deleteBySlug(slug);
}
