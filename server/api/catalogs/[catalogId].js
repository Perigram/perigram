import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { serializeForAccess } from '~/server/utils/entity-redaction.js';
import * as catalogService from '~/server/features/catalogs/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const catalogId = event.context.params.catalogId;
  
  if (event.req.method === 'GET') {
    const catalog = await catalogService.getById(catalogId, auth.userId, auth.organizationId, auth.role, auth);
    return serializeForAccess('catalog', catalog, auth);
  }
  
  if (event.req.method === 'PUT' || event.req.method === 'PATCH') {
    const body = await readBody(event);
    const catalog = await catalogService.update(catalogId, body, auth.userId, auth.organizationId, auth.role, auth);
    return serializeForAccess('catalog', catalog, auth);
  }
  
  if (event.req.method === 'DELETE') {
    return await catalogService.remove(catalogId, auth.userId, auth.organizationId, auth.role, auth);
  }
  
  return { error: 'Method not allowed' };
});
