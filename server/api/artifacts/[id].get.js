import { service } from '~/server/features/artifacts';
import { getArtifactsBucket } from '~/server/db/mongo';
import { toObjectId } from '~/server/utils/objectid';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  
  // Auth and basic checks are assumed to be in the service layer
  const artifact = await service.getById(id);

  // Check if the artifact is ready and has a file
  if (artifact.status !== 'READY' || !artifact.fileId) {
    throw createError({
      statusCode: 404,
      message: 'Artifact file not found or not ready.',
    });
  }

  const bucket = await getArtifactsBucket();
  
  // It's good practice to check if the file actually exists in GridFS
  const file = await bucket.find({ _id: toObjectId(artifact.fileId) }).next();
  if (!file) {
    throw createError({
      statusCode: 404,
      message: 'File not found in storage.',
    });
  }

  // Set headers for file download
  setResponseHeaders(event, {
    'Content-Type': artifact.mimeType || 'application/octet-stream',
    'Content-Length': file.length,
    'Content-Disposition': `inline; filename="${encodeURIComponent(artifact.name)}"`,
    'Cache-Control': 'public, max-age=31536000, immutable' // Cache for 1 year
  });

  // Create a download stream and return it
  // H3/Nitro will automatically handle piping the stream to the response
  return bucket.openDownloadStream(toObjectId(artifact.fileId));
});
