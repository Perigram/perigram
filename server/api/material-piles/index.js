import { defineEventHandler, readBody, getQuery } from 'h3';
import { requireAuth } from '../../utils/permissions';
import * as batchService from '../../features/material-piles/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  
  if (event.req.method === 'GET') {
    const query = getQuery(event);
    return await batchService.list(auth.userId, auth.organizationId, auth.role, auth, query);
  }
  
  if (event.req.method === 'POST') {
    const body = await readBody(event);
    return await batchService.create(body, auth.userId, auth.organizationId, auth.role, auth);
  }
  
  return { error: 'Method not allowed' };
});