/**
 * Cassette Designs Service
 */
import * as repository from './repository.js';
import { createError } from 'h3';
import { initializeStatus, addStatus } from '~/server/features/statuses/service';

export async function create(data, userId) {
  const design = await repository.create({
    ...data,
    ownerId: userId
  });
  
  await initializeStatus('cassette_designs', design._id.toString(), userId, 'Design created');
  return design;
}

export async function getById(id) {
  const design = await repository.findById(id);
  if (!design) {
    throw createError({ statusCode: 404, message: 'Cassette design not found' });
  }
  return design;
}

export async function listByOwner(userId, options) {
  return await repository.findByOwner(userId, options);
}

export async function update(id, updates, userId) {
  // Check existence and ownership if needed
  await getById(id);
  
  const result = await repository.update(id, updates);
  return result;
}

export async function deleteDesign(id, userId) {
  await getById(id);
  return await repository.deleteById(id);
}

export async function updateStatus(id, status, userId, note = '') {
  return await addStatus('cassette_designs', id, status, userId, note);
}
