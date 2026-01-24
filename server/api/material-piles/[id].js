import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as batchService from '~/server/features/material-piles/service';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  const id = event.context.params.id;
  
  if (event.req.method === 'GET') {
    return await batchService.getById(id, user);
  }
  
  if (event.req.method === 'PUT' || event.req.method === 'PATCH') {
    const body = await readBody(event);
    return await batchService.update(id, body, user);
  }
  
  if (event.req.method === 'DELETE') {
    return await batchService.remove(id, user);
  }
  
  return { error: 'Method not allowed' };
});
