import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as requisitionService from '~/server/features/requisitions/service';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  const id = event.context.params.id;
  
  if (event.req.method === 'POST') {
    return await requisitionService.fulfill(id, user);
  }
  
  return { error: 'Method not allowed' };
});
