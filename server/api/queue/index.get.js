import { defineEventHandler, getQuery } from 'h3';
import * as queuesService from '~/server/features/queues/service.js';
import { requireAuth } from '~/server/utils/permissions.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const query = getQuery(event);
  return await queuesService.list(
    {
      projectId: query.projectId,
      status: query.status,
      primaryStatus: query.primaryStatus
    },
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );
});
