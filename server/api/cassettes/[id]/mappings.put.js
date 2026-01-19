import * as cassetteService from '~/server/features/cassettes/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const id = event.context.params.id;
  const body = await readBody(event);
  
  const layerMapping = body.layerMappings || body.layerMapping;
  if (!layerMapping) {
    throw createError({ statusCode: 400, message: 'layerMapping or layerMappings is required' });
  }
  
  return await cassetteService.updateLayerMapping(
    id, 
    layerMapping, 
    auth.userId,
    auth.organizationId,
    auth.role,
    auth.permissions
  );
});
