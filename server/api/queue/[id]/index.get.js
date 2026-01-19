import { service } from '~/server/features/batches';

export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId;
  const id = getRouterParam(event, 'id');
  
  return await service.getById(id, userId);
});
