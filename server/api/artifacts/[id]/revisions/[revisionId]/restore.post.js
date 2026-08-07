import { defineEventHandler, getRouterParam } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { serializeForAccess } from '~/server/utils/entity-redaction.js';
import { service } from '~/server/features/artifacts';

export default defineEventHandler(async event => {
  const auth = await requireAuth(event);
  const artifact = await service.restoreFileRevision(
    getRouterParam(event, 'id'),
    getRouterParam(event, 'revisionId'),
    auth
  );
  return serializeForAccess('artifact', artifact, auth);
});
