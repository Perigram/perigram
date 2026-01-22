import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as catalogService from '~/server/features/catalogs/service';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  const catalogId = event.context.params.catalogId;
  
  if (event.req.method === 'GET') {
    return await catalogService.getById(catalogId, user);
  }
  
  if (event.req.method === 'PUT' || event.req.method === 'PATCH') {
    const body = await readBody(event);
    return await catalogService.update(catalogId, body, user);
  }
  
  if (event.req.method === 'DELETE') {
    return await catalogService.remove(catalogId, user);
  }
  
  return { error: 'Method not allowed' };
});
