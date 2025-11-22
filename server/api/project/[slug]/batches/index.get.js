import { service } from '~/server/features/batches';

export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId;
  const projectSlug = getRouterParam(event, 'slug');
  const query = getQuery(event);
  
  return await service.listByProject(projectSlug, userId, {
    status: query.status,
    limit: query.limit ? parseInt(query.limit) : 100,
    skip: query.skip ? parseInt(query.skip) : 0
  });
});
