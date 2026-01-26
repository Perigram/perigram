import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '../../utils/permissions';
import * as sheetService from '../../features/sheets/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  
  if (event.req.method === 'GET') {
    const query = getQuery(event);
    return await sheetService.list(auth.userId, auth.organizationId, auth.role, auth, query);
  }
  
  return { error: 'Method not allowed' };
});