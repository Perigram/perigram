import { defineEventHandler, readBody } from 'h3';
import * as organizationsService from '~/server/features/organizations/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  const user = requireAuth(event);
  const id = event.context.params.id;
  const body = await readBody(event);
  return await organizationsService.update(id, body, user);
});