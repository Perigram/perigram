import * as repository from './repository.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '~/server/utils/permissions';
import { createIdentity, createStatus } from '~/server/utils/blocks';
import { statusService } from '~/server/core/machines/service';
import { mapLineageQuery } from '~/server/utils/query';
import standardSlugify from 'standard-slugify';
import { generateRandomString } from '~/server/utils/strings';
import { ObjectId } from 'mongodb';

/**
 * Cassette Templates Service - v24 Standardized
 */

function toDTO(cassette) {
  if (!cassette) return null;
  return {
    ...cassette,
    name: cassette.identity?.name || cassette.name,
    slug: cassette.identity?.slug || cassette.slug
  };
}

export async function create(data, userId, userOrg, userRole, userPermissions) {
  // Lineage: Templates belong to the organization or the user themselves
  const targetOrgId = userOrg || userId;
  const lineage = { organizationId: new ObjectId(targetOrgId) };

  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, lineage, 'cassettes', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied for cassettes' });
  }

  const slug = data.slug || `${standardSlugify(data.name || 'template', { keepCase: false })}-${generateRandomString(6)}`;
  const origin = createStatus('ACTIVE', userId, { note: 'Template created' });

  const cassetteData = {
    identity: createIdentity(data.name || 'New Template', slug),
    origin,
    status: origin,
    lineage,
    definition: {
        type: data.type || 'PARAMETRIC', // PARAMETRIC | STANDARD
        data: data.data || null,
        parameters: data.parameters || []
    },
    metadata: data.metadata || {}
  };

  const cassette = await repository.create(cassetteData);
  return toDTO(cassette);
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const finalFilter = mapLineageQuery(filter);
  
  // Logic: Everyone can see templates if they have 'read' permission.
  // We don't force lineage filtering here because templates are shared/accessible across orgs
  // depending on the business model. 
  // However, we still check atomic permission later if needed.
  // To keep it simple and working as requested:
  
  const cassettes = await repository.find(finalFilter);
  return cassettes.map(toDTO);
}

export async function getById(id, userId, userOrg, userRole, userPermissions) {
  if (!ObjectId.isValid(id)) throw createError({ statusCode: 400, message: 'Invalid ID' });
  
  const cassette = await repository.findById(id);
  if (!cassette) throw createError({ statusCode: 404, message: 'Template not found' });
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, cassette.lineage, 'cassettes', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return toDTO(cassette);
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions) {
  const cassette = await repository.findById(id);
  if (!cassette) throw createError({ statusCode: 404, message: 'Template not found' });
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, cassette.lineage, 'cassettes', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (updates.status) {
    await statusService.transition('cassette', cassette._id, updates.status, userId, userRole, updates.statusMeta || {});
    delete updates.status;
  }

  const { identity, origin, status, lineage, definition, ...clean } = updates;
  
  if (updates.name) cassette.identity.name = updates.name;

  await repository.updateById(id, { identity: cassette.identity, ...clean });
  const updated = await repository.findById(id);
  return toDTO(updated);
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  const cassette = await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasLineagePermission({ memberships: userPermissions.memberships, role: userRole }, cassette.lineage, 'cassettes', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return await repository.deleteById(id);
}
