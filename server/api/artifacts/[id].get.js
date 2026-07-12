import { service } from '~/server/features/artifacts';
import { getSvgResultBucket, getDxfResultBucket } from '~/server/db/mongo';
import { toObjectId } from '~/server/utils/objectid';
import { getPrimaryState } from '~/server/core/blocks/index.js';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  
  console.log('[artifacts/[id].get] Downloading artifact:', id);
  
  // Auth and basic checks are assumed to be in the service layer
  const artifact = await service.getById(id);
  const artifactType = artifact.data?.type;
  const primaryAttachment = artifact.attachments?.primary;
  const fileId = primaryAttachment?.fileId;
  const mimeType = primaryAttachment?.metadata?.mimeType;
  
  console.log('[artifacts/[id].get] Artifact found:', { 
    id: artifact._id, 
    type: artifactType,
    status: artifact.status, 
    hasFileId: !!fileId 
  });

  // Check if the artifact is ready and has a file
  const artifactState = getPrimaryState(artifact.status);
  if (artifactState !== 'READY') {
    throw createError({
      statusCode: 400,
      message: `Artifact is not ready yet. Current status: ${artifactState}`,
    });
  }
  
  if (!fileId) {
    throw createError({
      statusCode: 404,
      message: 'Artifact has no file attached.',
    });
  }

  // Get the correct bucket based on attachment kind.
  let bucket;
  if (artifactType === 'LAYOUT_SVG') {
    bucket = await getSvgResultBucket();
  } else if (artifactType === 'LAYOUT_DXF') {
    bucket = await getDxfResultBucket();
  } else {
    throw createError({
      statusCode: 400,
      message: `Unsupported attachment kind: ${artifactType}`,
    });
  }
  
  // Check if the file actually exists in GridFS
  const file = await bucket.find({ _id: toObjectId(fileId) }).next();
  if (!file) {
    throw createError({
      statusCode: 404,
      message: 'File not found in storage.',
    });
  }

  // Set headers for file download
  setResponseHeaders(event, {
    'Content-Type': mimeType || 'application/octet-stream',
    'Content-Length': file.length,
    'Content-Disposition': `attachment; filename="${encodeURIComponent(artifact.identity?.name || artifact._id.toString())}"`,
    'Cache-Control': 'public, max-age=31536000, immutable'
  });

  // Create a download stream and return it
  return bucket.openDownloadStream(toObjectId(fileId));
});
