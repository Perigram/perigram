import { service } from '~/server/features/materials';

export default defineEventHandler(async (event) => {
  const userId = event.context.auth?.userId;
  if (!userId) throw createError({ statusCode: 401 });
  
  const body = await readBody(event);
  return await service.create(body);
});
