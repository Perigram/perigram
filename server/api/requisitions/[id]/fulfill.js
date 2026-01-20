import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as requisitionService from '~/server/features/requisitions/service';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  const id = event.context.params.id;
  const body = await readBody(event);
  
  return await requisitionService.fulfill(id, body, user);
});
