/**
 * Sheet Designs Service
 */
import * as repository from './repository.js';
import { createError } from 'h3';
import { initializeStatus, addStatus } from '~/server/features/statuses/service';

export async function create(data, userId) {
  const design = await repository.create({
    ...data,
    ownerId: userId
  });
  
  await initializeStatus('sheet_designs', design._id.toString(), userId, 'Sheet design created');
  return design;
}

export async function getById(id) {
  const design = await repository.findById(id);
  if (!design) {
    throw createError({ statusCode: 404, message: 'Sheet design not found' });
  }
  return design;
}

export async function updateStatus(id, status, userId, note = '') {
  return await addStatus('sheet_designs', id, status, userId, note);
}
