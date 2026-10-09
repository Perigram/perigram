import { createError, defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { importFromArtifact } from '#packages/facade/server/cassettes/service';

// Import a cassette template from an existing DXF_SOURCE artifact: the
// DXF becomes the payload, the extracted cut contour and mapped semantic
// layers become the template's stored geometry fields.
export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const body = await readBody(event) || {};
  if (!body.artifactId) throw createError({ statusCode: 400, message: 'artifactId is required' });

  return await importFromArtifact(
    body.artifactId,
    body.name,
    auth,
    body.layerMapping || null,
    body.parameters || null
  );
});
