import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/auth-helpers';
import * as sheetService from '~/server/features/sheets/service';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  
  if (event.req.method === 'GET') {
    return await sheetService.list(user);
  }
  
  return { error: 'Method not allowed' };
});
