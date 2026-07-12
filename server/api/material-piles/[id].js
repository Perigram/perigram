import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '../../utils/permissions';
import { serializeForAccess } from '../../utils/entity-redaction.js';
import * as batchService from '../../features/material-piles/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const id = event.context.params.id;
  
  if (event.req.method === 'GET') {
    const pile = await batchService.getById(id, auth.userId, auth.organizationId, auth.role, auth);
    return serializeForAccess('materialPile', pile, auth);
  }
  
  if (event.req.method === 'PUT' || event.req.method === 'PATCH') {
    const body = await readBody(event);
    const pile = await batchService.update(id, body, auth.userId, auth.organizationId, auth.role, auth);
    return serializeForAccess('materialPile', pile, auth);
  }
  
  if (event.req.method === 'DELETE') {
    return await batchService.remove(id, auth.userId, auth.organizationId, auth.role, auth);
  }
  
  return { error: 'Method not allowed' };
});
