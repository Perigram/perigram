import { service } from '~/server/features/cassettes';

export default defineEventHandler(async (event) => {
  const userId = event.context?.auth?.userId;
  if (!userId) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    });
  }

  const id = getRouterParam(event, 'id');
  const body = await readBody(event);
  
  return await service.update(id, body, userId);
});
