import { service } from '~/server/features/profile-templates';
import { requireAuth } from '~/server/utils/permissions.js';
import { serializeForAccess } from '~/server/utils/entity-redaction.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const id = getRouterParam(event, 'id');
  const profile = await service.getById(id, auth);
  return serializeForAccess('profileTemplate', profile, auth);
});

