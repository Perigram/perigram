import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as requisitionService from '~/server/features/requisitions/service';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  
  if (event.req.method === 'GET') {
    return await requisitionService.list(user);
  }
  
  if (event.req.method === 'POST') {
    const body = await readBody(event);
    return await requisitionService.create(body, user);
  }
  
  return { error: 'Method not allowed' };
});
