import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as cassetteService from '~/server/packs/facade/cassettes/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const id = event.context.params.id;
  const body = await readBody(event);
  
  return await cassetteService.update(
    id,
    body,
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );
});