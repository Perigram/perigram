import { service } from '~/server/features/tool-profiles';

export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId;
  const id = getRouterParam(event, 'id');
  return await service.remove(id, userId);
});
