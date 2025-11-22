import { service } from '~/server/features/cassettes';

export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId;
  const id = event.context.params.id;
  
  return await service.getById(id, userId);
});
