import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as warehouseService from '~/server/features/warehouses/service';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  const id = event.context.params.id;
  
  if (event.req.method === 'GET') {
    return await warehouseService.getById(id, user);
  }
  
  if (event.req.method === 'PUT' || event.req.method === 'PATCH') {
    const body = await readBody(event);
    return await warehouseService.update(id, body, user);
  }
  
  if (event.req.method === 'DELETE') {
    return await warehouseService.remove(id, user);
  }
  
  return { error: 'Method not allowed' };
});
