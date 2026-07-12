import { service } from '~/server/features/pen-templates';
import { requireAuth } from '~/server/utils/permissions.js';
import { serializeForAccess } from '~/server/utils/entity-redaction.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const body = await readBody(event);
  const pen = await service.create(body, auth.userId);
  return serializeForAccess('penTemplate', pen, auth);
});
