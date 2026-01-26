import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as remnantService from '~/server/features/remnants/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  return await remnantService.searchReusable(auth.userId, auth.organizationId, auth.role, auth);
});