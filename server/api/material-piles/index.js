import { defineEventHandler, readBody, getQuery } from 'h3';
import { requireAuth } from '../../utils/permissions';
import { serializeForAccess, serializeManyForAccess } from '../../utils/entity-redaction.js';
import * as batchService from '../../features/material-piles/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  
  if (event.req.method === 'GET') {
    const query = getQuery(event);
    const piles = await batchService.list(auth.userId, auth.organizationId, auth.role, auth, query);
    return serializeManyForAccess('materialPile', piles, auth);
  }
  
  if (event.req.method === 'POST') {
    const body = await readBody(event);
    const pile = await batchService.create(body, auth.userId, auth.organizationId, auth.role, auth);
    return serializeForAccess('materialPile', pile, auth);
  }
  
  return { error: 'Method not allowed' };
});
