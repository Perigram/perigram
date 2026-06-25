import { defineEventHandler } from 'h3';
import * as queuesService from '../../../features/queues/service.js';
import { requireAuth } from '../../../utils/permissions.js';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const id = event.context.params.id;

  const result = await queuesService.remove(
    id,
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );

  return { success: Boolean(result?.deletedCount ?? result) };
});
