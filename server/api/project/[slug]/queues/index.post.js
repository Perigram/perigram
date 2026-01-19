import * as queuesService from '~/server/features/queues/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const projectSlug = event.context.params.slug;
  const body = await readBody(event);
  
  return await queuesService.create(
    { ...body, projectSlug }, 
    auth.userId,
    auth.organizationId,
    auth.role,
    auth.permissions
  );
});
