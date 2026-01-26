import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '../../utils/permissions';
import * as requisitionService from '../../features/requisitions/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  
  if (event.req.method === 'GET') {
    return await requisitionService.list(auth.userId, auth.organizationId, auth.role, auth);
  }
  
  if (event.req.method === 'POST') {
    const body = await readBody(event);
    return await requisitionService.create(body, auth.userId, auth.organizationId, auth.role, auth);
  }
  
  return { error: 'Method not allowed' };
});
