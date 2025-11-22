import { service } from '~/server/features/tool-profiles';

export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId;
  const body = await readBody(event);
  return await service.create(body, userId);
});
