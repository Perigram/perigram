import { service } from '~/server/features/materials';

export default defineEventHandler(async (event) => {
  const userId = event.context.auth?.userId;
  if (!userId) throw createError({ statusCode: 401 });
  
  return await service.list();
});
