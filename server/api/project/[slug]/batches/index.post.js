import { service } from '~/server/features/batches';

export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId;
  const projectSlug = getRouterParam(event, 'slug');
  const body = await readBody(event);
  
  return await service.create({ ...body, projectSlug }, userId);
});
