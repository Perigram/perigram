import { service } from '~/server/features/pen-templates';
import { requireAuth } from '~/server/utils/permissions.js';
import { serializeManyForAccess } from '~/server/utils/entity-redaction.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const pens = await service.listAll(auth.userId);
  return serializeManyForAccess('penTemplate', pens, auth);
});
