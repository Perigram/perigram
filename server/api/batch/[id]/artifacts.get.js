import { service } from '~/server/features/batches';

export default defineEventHandler(async (event) => {
  const userId = event.context?.auth?.userId;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }
  const id = getRouterParam(event, 'id');
  
  return await service.getArtifacts(id, userId);
});
