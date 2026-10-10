import { defineEventHandler, readBody, createError } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as artifactsService from '~/server/features/artifacts/service.js';
import { convertArtifact } from '~/server/features/artifact-conversions/operations.js';

// The client-reachable conversion surface: runs one of the organization's
// installed-plugin conversions (catalog from the install snapshots) on an
// existing artifact — the same engine the convertArtifact command drives
// for process flows.
export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const body = await readBody(event) || {};
  if (!body.artifactId || !body.conversion) {
    throw createError({ statusCode: 400, message: 'artifactId and conversion are required' });
  }
  const artifact = await artifactsService.getById(
    body.artifactId, auth.userId, auth.organizationId, auth.role, auth
  );
  if (!artifact) throw createError({ statusCode: 404, message: 'Artifact not found' });
  return await convertArtifact({
    entities: { artifact },
    parameters: {
      conversion: body.conversion,
      name: body.name,
      layerMapping: body.layerMapping,
      parameters: body.parameters
    },
    auth
  });
});
