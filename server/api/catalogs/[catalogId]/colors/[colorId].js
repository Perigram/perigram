import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as catalogService from '~/server/features/catalogs/service';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  const { catalogId, colorId } = event.context.params;
  
  if (event.req.method === 'PUT' || event.req.method === 'PATCH') {
    const body = await readBody(event);
    return await catalogService.updateSheetType(catalogId, colorId, body, user);
  }
  
  if (event.req.method === 'DELETE') {
    return await catalogService.removeSheetType(catalogId, colorId, user);
  }
  
  return { error: 'Method not allowed' };
});
