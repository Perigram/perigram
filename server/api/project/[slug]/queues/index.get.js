import * as queuesService from '~/server/features/queues/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const projectSlug = event.context.params.slug;
  const query = getQuery(event);
  
  return await queuesService.listByProject(
    projectSlug, 
    auth.userId, 
    auth.organizationId,
    auth.role,
    auth.permissions,
    {
      status: query.status,
      limit: query.limit ? parseInt(query.limit) : 100,
      skip: query.skip ? parseInt(query.skip) : 0
    }
  );
});
