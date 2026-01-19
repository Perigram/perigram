import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/auth-helpers';
import * as sheetService from '~/server/features/sheets/service';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  const id = event.context.params.id;
  
  if (event.req.method === 'POST') {
    const body = await readBody(event);
    return await sheetService.allocateFromBatch(id, body.pileId, body.count, user);
  }
  
  return { error: 'Method not allowed' };
});
