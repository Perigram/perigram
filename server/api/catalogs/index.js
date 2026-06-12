import { defineEventHandler, readBody, getQuery } from 'h3';
import { requireAuth } from '../../utils/permissions';
import { serializeForAccess, serializeManyForAccess } from '../../utils/entity-redaction.js';
import * as catalogService from '../../features/catalogs/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  
  if (event.req.method === 'GET') {
    const query = getQuery(event);
    const catalogs = await catalogService.list(auth.userId, auth.organizationId, auth.role, auth, query);
    return serializeManyForAccess('catalog', catalogs, auth);
  }
  
  if (event.req.method === 'POST') {
    const body = await readBody(event);
    const catalog = await catalogService.create(body, auth.userId, auth.organizationId, auth.role, auth);
    return serializeForAccess('catalog', catalog, auth);
  }
  
  return { error: 'Method not allowed' };
});
