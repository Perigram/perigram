import { service } from '~/server/features/cassettes';

export default defineEventHandler(async (event) => {
  const userId = event.context?.auth?.userId;
  
  if (!userId) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    });
  }
  
  const query = getQuery(event);
  
  return await service.listForUser(userId, {
    status: query.status,
    limit: query.limit ? parseInt(query.limit) : 100,
    skip: query.skip ? parseInt(query.skip) : 0
  });
});
