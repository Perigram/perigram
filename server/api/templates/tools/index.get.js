import { service } from '~/server/features/tool-profiles';

export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId;
  return await service.listAll(userId);
});
