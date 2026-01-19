import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/auth-helpers';
import * as catalogService from '~/server/features/catalogs/service';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  const { catalogId, sheetTypeId } = event.context.params;
  
  if (event.req.method === 'PUT' || event.req.method === 'PATCH') {
    const body = await readBody(event);
    return await catalogService.updateSheetType(catalogId, sheetTypeId, body, user);
  }
  
  if (event.req.method === 'DELETE') {
    return await catalogService.removeSheetType(catalogId, sheetTypeId, user);
  }
  
  return { error: 'Method not allowed' };
});
