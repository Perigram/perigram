import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/auth-helpers';
import * as remnantService from '~/server/features/remnants/service';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  
  if (event.req.method === 'GET') {
    return await remnantService.list(user);
  }
  
  if (event.req.method === 'POST') {
    const body = await readBody(event);
    return await remnantService.create(body, user);
  }
  
  return { error: 'Method not allowed' };
});
