import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/auth-helpers';
import * as warehouseService from '~/server/features/warehouses/service';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  
  if (event.req.method === 'GET') {
    return await warehouseService.list(user);
  }
  
  if (event.req.method === 'POST') {
    const body = await readBody(event);
    return await warehouseService.create(body, user);
  }
  
  return { error: 'Method not allowed' };
});
