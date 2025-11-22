import { service } from '~/server/features/cassettes';

export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId;
  const id = getRouterParam(event, 'id');
  const body = await readBody(event);
  
  const layerMapping = body.layerMappings || body.layerMapping;
  if (!layerMapping) {
    throw createError({ statusCode: 400, message: 'layerMapping or layerMappings is required' });
  }
  
  return await service.updateLayerMapping(id, layerMapping, userId);
});
