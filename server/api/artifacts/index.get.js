import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { serializeManyForAccess } from '~/server/utils/entity-redaction.js';
import { service } from '~/server/features/artifacts';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const artifacts = await service.list(getQuery(event), auth);
  return serializeManyForAccess('artifact', artifacts, auth);
});
