import { service } from '~/server/features/cassettes';

export default defineEventHandler(async (event) => {
  const userId = event.context?.auth?.userId;
  
  if (!userId) {
    // Return empty array if not authenticated
    return [];
  }
  
  const query = getQuery(event);
  
  return await service.listForUser(userId, {
    status: query.status,
    limit: query.limit ? parseInt(query.limit) : 100,
    skip: query.skip ? parseInt(query.skip) : 0
  });
});
