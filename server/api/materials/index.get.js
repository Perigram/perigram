import { service } from '~/server/features/materials';
import { requireAuth } from '~/server/utils/permissions.js';
import { serializeManyForAccess } from '~/server/utils/entity-redaction.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const materials = await service.list();
  return serializeManyForAccess('material', materials, auth);
});
