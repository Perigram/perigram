import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as remnantService from '~/server/features/remnants/service';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  const id = event.context.params.id;
  
  if (event.req.method === 'GET') {
    return await remnantService.getById(id, user);
  }
  
  if (event.req.method === 'PUT' || event.req.method === 'PATCH') {
    const body = await readBody(event);
    return await remnantService.update(id, body, user);
  }
  
  if (event.req.method === 'DELETE') {
    return await remnantService.remove(id, user);
  }
  
  return { error: 'Method not allowed' };
});
