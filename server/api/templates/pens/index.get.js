import { service } from '~/server/features/pen-templates';

export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId;
  return await service.listAll(userId);
});
