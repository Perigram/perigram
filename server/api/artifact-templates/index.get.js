import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { serializeManyForAccess } from '~/server/utils/entity-redaction.js';
import { service } from '~/server/features/artifact-templates';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const templates = await service.list(getQuery(event), auth.userId, auth.organizationId, auth.role, auth);
  return serializeManyForAccess('artifactTemplate', templates, auth);
});
