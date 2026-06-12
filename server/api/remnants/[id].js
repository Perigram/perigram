import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { serializeForAccess } from '~/server/utils/entity-redaction.js';
import * as remnantService from '~/server/features/remnants/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const id = event.context.params.id;
  
  if (event.req.method === 'GET') {
    const remnant = await remnantService.getById(id, auth.userId, auth.organizationId, auth.role, auth);
    return serializeForAccess('remnant', remnant, auth);
  }
  
  if (event.req.method === 'PUT' || event.req.method === 'PATCH') {
    const body = await readBody(event);
    const remnant = await remnantService.update(id, body, auth.userId, auth.organizationId, auth.role, auth);
    return serializeForAccess('remnant', remnant, auth);
  }
  
  if (event.req.method === 'DELETE') {
    return await remnantService.remove(id, auth.userId, auth.organizationId, auth.role, auth);
  }
  
  return { error: 'Method not allowed' };
});
