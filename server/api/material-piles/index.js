import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as batchService from '~/server/features/material-piles/service';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  
  if (event.req.method === 'GET') {
    return await batchService.list(user);
  }
  
  if (event.req.method === 'POST') {
    const body = await readBody(event);
    return await batchService.create(body, user);
  }
  
  return { error: 'Method not allowed' };
});
