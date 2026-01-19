import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/auth-helpers';
import * as sheetService from '~/server/features/sheets/service';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  const id = event.context.params.id;
  
  if (event.req.method === 'GET') {
    return await sheetService.getById(id, user);
  }
  
  if (event.req.method === 'PUT' || event.req.method === 'PATCH') {
    const body = await readBody(event);
    return await sheetService.update(id, body, user);
  }
  
  if (event.req.method === 'DELETE') {
    return await sheetService.remove(id, user);
  }
  
  return { error: 'Method not allowed' };
});
