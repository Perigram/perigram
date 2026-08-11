import { service } from '~/server/features/artifacts';
import * as filesService from '~/server/features/files/service.js';
import { requireAuth } from '~/server/utils/permissions.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const id = getRouterParam(event, 'id');
  const artifact = await service.getById(id, auth.userId, auth.organizationId, auth.role, auth);
  const primaryAttachment = artifact.attachments?.primary;
  const fileId = primaryAttachment?.fileId;
  const mimeType = primaryAttachment?.metadata?.mimeType;
  if (!fileId) {
    throw createError({
      statusCode: 404,
      message: 'Artifact has no file attached.',
    });
  }

  const bucketName = primaryAttachment.metadata?.bucketName || primaryAttachment.bucketName || 'uploads';
  setResponseHeaders(event, {
    'Content-Type': mimeType || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${encodeURIComponent(artifact.identity?.name || artifact._id.toString())}"`,
    'Cache-Control': 'private, no-cache'
  });
  return await filesService.getFileStream(fileId, bucketName);
});
