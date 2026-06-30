import { service } from '~/server/features/profile-templates';
import { requireAuth } from '~/server/utils/permissions.js';
import { serializeManyForAccess } from '~/server/utils/entity-redaction.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const profiles = await service.listAll(auth, getQuery(event));
  return serializeManyForAccess('profileTemplate', profiles, auth);
});
