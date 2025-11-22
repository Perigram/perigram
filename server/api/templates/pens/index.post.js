import { service } from '~/server/features/pen-templates';

export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId;
  const body = await readBody(event);
  return await service.create(body, userId);
});
