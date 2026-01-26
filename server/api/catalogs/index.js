import { defineEventHandler, readBody, getQuery } from 'h3';
import { requireAuth } from '../../utils/permissions';
import * as catalogService from '../../features/catalogs/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  
  if (event.req.method === 'GET') {
    const query = getQuery(event);
    return await catalogService.list(auth.userId, auth.organizationId, auth.role, auth, query);
  }
  
  if (event.req.method === 'POST') {
    const body = await readBody(event);
    return await catalogService.create(body, auth.userId, auth.organizationId, auth.role, auth);
  }
  
  return { error: 'Method not allowed' };
});