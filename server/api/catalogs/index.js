import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as catalogService from '~/server/features/catalogs/service';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  
  if (event.req.method === 'GET') {
    return await catalogService.list(user);
  }
  
  if (event.req.method === 'POST') {
    const body = await readBody(event);
    return await catalogService.create(body, user);
  }
  
  return { error: 'Method not allowed' };
});
