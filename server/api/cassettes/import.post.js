import { createError, defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as cassetteService from '~/server/features/cassettes/service';

// Import a cassette template from an existing DXF_SOURCE artifact: the
// two-step companion to `POST /api/cassettes/upload` (which accepts the file
// directly). Returns the created cassette template DTO with the extracted
// cut contour and mapped semantic layers on its own data.
export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const body = await readBody(event) || {};
  if (!body.artifactId) throw createError({ statusCode: 400, message: 'artifactId is required' });

  return await cassetteService.importFromArtifact(
    body.artifactId,
    body.name,
    auth.userId,
    auth.organizationId,
    auth.role,
    auth,
    body.layerMapping || null,
    body.parameters || null
  );
});
