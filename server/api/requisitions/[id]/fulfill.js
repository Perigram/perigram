import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as requisitionService from '~/server/features/requisitions/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const id = event.context.params.id;
  // body is not used by fulfill in service, but we'll read it anyway if it was there
  // Actually, fulfill(id, userId, userOrg, userRole, userPermissions)
  return await requisitionService.fulfill(id, auth.userId, auth.organizationId, auth.role, auth);
});
