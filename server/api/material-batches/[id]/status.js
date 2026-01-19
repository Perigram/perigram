import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as batchService from '~/server/features/material-batches/service';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  const id = event.context.params.id;
  
  if (event.req.method === 'POST') {
    const body = await readBody(event);
    return await batchService.updateStatus(id, body.status, body.note, user, body.additionalData);
  }
  
  return { error: 'Method not allowed' };
});
