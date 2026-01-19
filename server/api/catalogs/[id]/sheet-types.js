import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as catalogService from '~/server/features/catalogs/service';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  const catalogId = event.context.params.id;
  
  if (event.req.method === 'POST') {
    const body = await readBody(event);
    return await catalogService.addSheetType(catalogId, body, user);
  }
  
  return { error: 'Method not allowed' };
});
