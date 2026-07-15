import { createError, defineEventHandler, getRouterParam, setResponseHeaders } from 'h3';
import { getPrimaryState } from '~/server/core/blocks/index.js';
import { service } from '~/server/features/artifacts';
import * as filesService from '~/server/features/files/service.js';
import { requireAuth } from '~/server/utils/permissions.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const artifact = await service.getById(getRouterParam(event, 'id'), auth.userId, auth.organizationId, auth.role, auth);
  if (getPrimaryState(artifact.status) !== 'READY') {
    throw createError({ statusCode: 400, message: 'Artifact is not ready' });
  }

  const attachment = artifact.attachments?.primary;
  if (!attachment?.fileId) throw createError({ statusCode: 404, message: 'Artifact has no file attached' });

  const filename = attachment.name || artifact.identity?.name || `${artifact._id}`;
  setResponseHeaders(event, {
    'Content-Type': attachment.metadata?.mimeType || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`
  });
  return await filesService.getFileStream(attachment.fileId, attachment.metadata?.bucketName || 'uploads');
});
