import { service } from '~/server/features/artifacts';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  return await service.remove(id);
});
