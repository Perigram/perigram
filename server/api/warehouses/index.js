import { defineEventHandler, readBody, getQuery } from 'h3';
import { requireAuth } from '../../utils/permissions';
import { serializeForAccess, serializeManyForAccess } from '../../utils/entity-redaction.js';
import * as warehouseService from '../../features/warehouses/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  
  if (event.req.method === 'GET') {
    const query = getQuery(event);
    const warehouses = await warehouseService.list(auth.userId, auth.organizationId, auth.role, auth, query);
    return serializeManyForAccess('warehouse', warehouses, auth);
  }
  
  if (event.req.method === 'POST') {
    const body = await readBody(event);
    const warehouse = await warehouseService.create(body, auth.userId, auth.organizationId, auth.role, auth);
    return serializeForAccess('warehouse', warehouse, auth);
  }
  
  return { error: 'Method not allowed' };
});
