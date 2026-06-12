import { service } from '~/server/features/tool-profiles';
import { requireAuth } from '~/server/utils/permissions.js';
import { serializeForAccess } from '~/server/utils/entity-redaction.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const id = getRouterParam(event, 'id');
  const body = await readBody(event);
  const tool = await service.update(id, body, auth.userId);
  return serializeForAccess('toolProfile', tool, auth);
});
