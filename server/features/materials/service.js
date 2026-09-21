/**
 * Materials Service
 */

import * as repository from './repository.js';
import { createProcessUpdateHandler } from '../_template/process-update-handler.js';
import { createError } from 'h3';
import { createIdentity, createStatus, createData } from '~/server/core/blocks/index.js';
import { Material } from './model.js';
import { markPublicSystemData } from '#shared/public-entities.js';

function toDTO(material) {
  if (!material) return null;
  return new Material(material).toJSON();
}

export async function list(options = {}) {
  const materials = await repository.find({}, options);
  return materials.map(toDTO);
}

export async function getById(id) {
  const material = await repository.findById(id);
  if (!material) {
    throw createError({ statusCode: 404, message: 'Material not found' });
  }
  return toDTO(material);
}

export async function create(data) {
  if (!data.name || !data.code) {
    throw createError({ statusCode: 400, message: 'Name and Code are required' });
  }
  
  const existing = await repository.findByCode(data.code);
  if (existing) {
    throw createError({ statusCode: 409, message: 'Material code already exists' });
  }
  
  const origin = createStatus('ACTIVE', 'SYSTEM', { note: 'Material defined' });

  const materialData = {
    identity: createIdentity(data.name, '', data.code),
    origin,
    status: origin,
    data: createData({
      code: data.code,
      description: data.description || ''
    })
  };

  const created = await repository.create(markPublicSystemData(materialData));
  return toDTO(created);
}

export async function update(id, updates) {
  const material = await repository.findById(id);
  if (!material) throw createError({ statusCode: 404, message: 'Material not found' });

  const { identity, origin, status, data: updatesData, ...clean } = updates;
  
  if (updates.name) material.identity.name = updates.name;
  if (updates.code) {
    material.identity.serial = updates.code;
    material.data.code = updates.code;
  }

  const materialData = {
    ...material.data,
    ...updatesData,
    ...clean
  };

  await repository.updateById(id, { identity: material.identity, data: materialData });
  const updated = await repository.findById(id);
  return toDTO(updated);
}

export async function remove(id) {
  const success = await repository.deleteById(id);
  if (!success) {
    throw createError({ statusCode: 404, message: 'Material not found' });
  }
  return { success: true };
}

export const processUpdate = createProcessUpdateHandler({
  typeId: 'material',
  repository,
  Model: Material
});
