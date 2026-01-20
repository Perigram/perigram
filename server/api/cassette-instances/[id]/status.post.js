import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as cassetteInstanceService from '~/server/features/cassette-instances/service';

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event);
  const id = event.context.params.id;
  const body = await readBody(event);
  
  return await cassetteInstanceService.updateStatus(id, body.status, body.note, user);
});
