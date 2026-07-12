import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '../../utils/permissions';
import { serializeForAccess, serializeManyForAccess } from '../../utils/entity-redaction.js';
import * as requisitionService from '../../features/requisitions/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  
  if (event.req.method === 'GET') {
    const requisitions = await requisitionService.list(auth.userId, auth.organizationId, auth.role, auth);
    return serializeManyForAccess('requisition', requisitions, auth);
  }
  
  if (event.req.method === 'POST') {
    const body = await readBody(event);
    const requisition = await requisitionService.create(body, auth.userId, auth.organizationId, auth.role, auth);
    return serializeForAccess('requisition', requisition, auth);
  }
  
  return { error: 'Method not allowed' };
});
