import { service } from '~/server/features/pen-templates';

export default defineEventHandler(async (event) => {
  const userId = event.context?.auth?.userId;
  // Allow fetching system pens without auth, but user pens require auth
  return await service.listAll(userId || null);
});
