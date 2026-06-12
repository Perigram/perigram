import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { serializeForAccess } from '~/server/utils/entity-redaction.js';
import * as requisitionService from '~/server/features/requisitions/service';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const id = event.context.params.id;
  
  if (event.req.method === 'GET') {
    const requisition = await requisitionService.getById(id, auth.userId, auth.organizationId, auth.role, auth);
    return serializeForAccess('requisition', requisition, auth);
  }
  
  if (event.req.method === 'PUT' || event.req.method === 'PATCH') {
    const body = await readBody(event);
    const requisition = await requisitionService.update(id, body, auth.userId, auth.organizationId, auth.role, auth);
    return serializeForAccess('requisition', requisition, auth);
  }
  
  if (event.req.method === 'DELETE') {
    return await requisitionService.remove(id, auth.userId, auth.organizationId, auth.role, auth);
  }
  
  return { error: 'Method not allowed' };
});
