import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { serializeForAccess } from '~/server/utils/entity-redaction.js';
import { service } from '~/server/features/artifact-templates';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const body = await readBody(event);
  const template = await service.replaceLayout(getRouterParam(event, 'id'), body?.layout, auth);
  return serializeForAccess('artifactTemplate', template, auth);
});
