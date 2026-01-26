import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as cassetteService from '~/server/features/cassettes/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const body = await readBody(event);
  
  return await cassetteService.create(
    body,
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );
});