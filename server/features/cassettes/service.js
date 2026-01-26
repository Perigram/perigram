import * as repository from './repository.js';
import { createError } from 'h3';
import { hasPermission } from '~/server/utils/auth-helpers';
import { getLineageFilter } from '~/server/utils/permissions';
import { ObjectId } from 'mongodb';
import { initializeStatus, addStatus } from '~/server/features/statuses/service';
import standardSlugify from 'standard-slugify';
import { generateRandomString } from '~/server/utils/strings';

export async function listForUser(userId, userOrg, userRole, userPermissions, options = {}) {
  if (!hasPermission({ permissions: userPermissions.permissions, role: userRole }, 'cassettes', 'read')) {
    return [];
  }
  
  return await repository.findByOwner(userId, options);
}

export async function getById(id, userId, userOrg, userRole, userPermissions) {
  if (!ObjectId.isValid(id)) {
    throw createError({ statusCode: 400, message: 'Invalid ID format' });
  }
  
  if (!hasPermission({ permissions: userPermissions.permissions, role: userRole }, 'cassettes', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  let cassette = await repository.findById(id);
  if (!cassette) {
    const { connectDB } = await import('../../db/mongo.js');
    const db = await connectDB();
    cassette = await db.collection('baked_cassettes').findOne({ _id: new ObjectId(id) });
  }

  if (!cassette) throw createError({ statusCode: 404, message: 'Cassette not found' });
  
  if (userRole !== 'SuperAdmin' && cassette.userId !== userId && cassette.ownerId !== userId) {
      throw createError({ statusCode: 403, message: 'Access denied' });
  }
  
  return cassette;
}

export async function create(data, userId, userOrg, userRole, userPermissions) {
  if (!hasPermission({ permissions: userPermissions.permissions, role: userRole }, 'cassettes', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const slug = data.slug || (data.data ? `parametric-${Date.now()}` : standardSlugify(data.name, { keepCase: false }) + `-${generateRandomString(6)}`);
  
  const cassetteData = {
    name: data.name,
    slug: slug,
    userId: userId,
    ownerId: userId,
    type: data.data ? 'PARAMETRIC' : 'STANDARD',
    data: data.data || null,
    dxfId: data.dxfId || null,
    svgId: data.svgId || null,
    layerMapping: data.layerMapping || {},
    parameters: data.data ? Object.keys(data.data.params || {}) : (data.parameters || []),
    processingStatus: data.data ? 'done' : 'pending',
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  const cassette = await repository.create(cassetteData);
  await initializeStatus('cassettes', cassette._id.toString(), userId, 'Cassette created');
  return cassette;
}

export async function update(id, data, userId, userOrg, userRole, userPermissions) {
  await getById(id, userId, userOrg, userRole, userPermissions);
  
  if (!hasPermission({ permissions: userPermissions.permissions, role: userRole }, 'cassettes', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const updates = { updatedAt: new Date() };
  if (data.name) updates.name = data.name;
  if (data.data) {
    updates.data = data.data;
    updates.parameters = Object.keys(data.data.params || {});
  }
  if (data.layerMapping) updates.layerMapping = data.layerMapping;
  
  await repository.updateById(id, updates);
  return await repository.findById(id);
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  await getById(id, userId, userOrg, userRole, userPermissions);
  if (!hasPermission({ permissions: userPermissions.permissions, role: userRole }, 'cassettes', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  await repository.deleteById(id);
  return { success: true };
}