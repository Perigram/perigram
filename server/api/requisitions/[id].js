import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as requisitionService from '~/server/features/requisitions/service';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const id = event.context.params.id;
  
  if (event.req.method === 'GET') {
    return await requisitionService.getById(id, auth.userId, auth.organizationId, auth.role, auth);
  }
  
  if (event.req.method === 'PUT' || event.req.method === 'PATCH') {
    const body = await readBody(event);
    return await requisitionService.update(id, body, auth.userId, auth.organizationId, auth.role, auth);
  }
  
  if (event.req.method === 'DELETE') {
    return await requisitionService.remove(id, auth.userId, auth.organizationId, auth.role, auth);
  }
  
  return { error: 'Method not allowed' };
});
