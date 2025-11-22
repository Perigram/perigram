import { service } from '~/server/features/cassettes';

export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId;
  const id = getRouterParam(event, 'id');
  const body = await readBody(event);
  
  if (!body.layerMapping) {
    throw createError({ statusCode: 400, message: 'layerMapping is required' });
  }
  
  return await service.updateLayerMapping(id, body.layerMapping, userId);
});
