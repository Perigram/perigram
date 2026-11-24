import { createError, defineEventHandler, getRouterParam, readBody } from 'h3';
import { handleCollab } from '~/server/features/pages/collab.js';

export default defineEventHandler(async event => {
  const auth = event.context?.auth;
  if (!auth?.userId) throw createError({ statusCode: 401, message: 'Authentication required' });
  const pageId = getRouterParam(event, 'id') || '';
  if (!pageId) throw createError({ statusCode: 400, message: 'Page id is required' });
  return handleCollab(pageId, await readBody(event) || {}, auth);
});
