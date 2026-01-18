import { service } from '~/server/features/batches';

export default defineEventHandler(async (event) => {
  const userId = event.context?.auth?.userId;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }
  const id = getRouterParam(event, 'id');
  
  const query = getQuery(event);
  return await service.getArtifacts(id, userId, { runId: query.runId });
});
