import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '../../utils/permissions';
import { serializeForAccess } from '../../utils/entity-redaction.js';
import * as sheetService from '../../features/sheets/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const id = event.context.params.id;
  
  if (event.req.method === 'GET') {
    const sheet = await sheetService.getById(id, auth.userId, auth.organizationId, auth.role, auth);
    return serializeForAccess('sheet', sheet, auth);
  }
  
  if (event.req.method === 'PUT' || event.req.method === 'PATCH') {
    const body = await readBody(event);
    const sheet = await sheetService.update(id, body, auth.userId, auth.organizationId, auth.role, auth);
    return serializeForAccess('sheet', sheet, auth);
  }
  
  if (event.req.method === 'DELETE') {
    return await sheetService.remove(id, auth.userId, auth.organizationId, auth.role, auth);
  }
  
  return { error: 'Method not allowed' };
});
