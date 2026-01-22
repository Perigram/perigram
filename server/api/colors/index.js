import { defineEventHandler, readBody, getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as colorService from '~/server/features/colors/service';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  
  if (event.req.method === 'GET') {
    const filter = getQuery(event);
    return await colorService.list(filter);
  }
  
  if (event.req.method === 'POST') {
    const body = await readBody(event);
    return await colorService.create(body, user);
  }
  
  return { error: 'Method not allowed' };
});
