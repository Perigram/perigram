import { createError, defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as cassetteService from '~/server/features/cassettes/service.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const body = await readBody(event);
  if (!body?.artifactId) throw createError({ statusCode: 400, message: 'DXF artifact is required' });
  const imported = await cassetteService.importFromArtifact(
    body.artifactId,
    body.name,
    auth.userId,
    auth.organizationId,
    auth.role,
    auth,
    body.layerMapping || null,
    body.parameters || null
  );
  return imported.design;
});
