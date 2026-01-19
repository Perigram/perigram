import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as remnantService from '~/server/features/remnants/service';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  
  if (event.req.method === 'GET') {
    return await remnantService.searchReusable(user);
  }
  
  return { error: 'Method not allowed' };
});
