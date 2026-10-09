import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import { updateLayout } from '~/server/packs/facade/sheet-designs/operations.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  return await updateLayout(getRouterParam(event, 'id'), await readBody(event), auth);
});
