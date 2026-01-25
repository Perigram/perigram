import * as projectsService from '~/server/features/projects/service';
import * as queuesService from '~/server/features/queues/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const projectSlug = event.context.params.slug;
  const body = await readBody(event);
  
  const project = await projectsService.getBySlug(
    projectSlug,
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );

  return await queuesService.create(
    { ...body, projectId: project._id }, 
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );
});
