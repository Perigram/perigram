import { service } from '~/server/features/cassettes';

export default defineEventHandler(async (event) => {
  const userId = event.context?.auth?.userId;
  if (!userId) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    });
  }

  const body = await readBody(event);
  
  return await service.create(body, userId);
});
