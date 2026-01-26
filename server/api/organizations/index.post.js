import { defineEventHandler, readBody } from 'h3';
import * as organizationsService from '~/server/features/organizations/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const body = await readBody(event);
  return await organizationsService.create(body, auth.userId, auth.organizationId, auth.role, auth);
});