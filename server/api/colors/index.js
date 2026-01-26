import { defineEventHandler, readBody, getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as colorService from '~/server/features/colors/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  
  if (event.req.method === 'GET') {
    const filter = getQuery(event);
    return await colorService.list(auth.userId, auth.organizationId, auth.role, auth, filter);
  }
  
  if (event.req.method === 'POST') {
    const body = await readBody(event);
    return await colorService.create(body, auth.userId, auth.organizationId, auth.role, auth);
  }
  
  return { error: 'Method not allowed' };
});