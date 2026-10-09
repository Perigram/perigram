import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { buildWorklist } from '~/server/core/machines/worklist.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  return await buildWorklist(auth);
});
