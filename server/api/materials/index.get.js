import { service } from '~/server/features/materials';
import { serializeManyForAccess } from '~/server/utils/entity-redaction.js';

export default defineEventHandler(async (event) => {
  const auth = event.context.auth || null;
  const materials = await service.list();
  return serializeManyForAccess('material', materials, auth);
});
