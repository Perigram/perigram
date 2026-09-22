import { createError, defineEventHandler, getRouterParam, setResponseHeaders } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as filesService from '~/server/features/files/service.js';
import * as revisionService from '~/server/features/instance-revisions/service.js';

export default defineEventHandler(async event => {
  const auth = await requireAuth(event);
  const revision = await revisionService.getById(getRouterParam(event, 'id'), auth.userId, auth.role, auth);
  const file = revision.attachments?.primary;
  if (!file?.fileId) throw createError({ statusCode: 404, message: 'Revision has no file attached' });
  setResponseHeaders(event, {
    'Content-Type': file.metadata?.mimeType || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${encodeURIComponent(file.name || revision.identity?.name || revision._id)}"`,
    'Cache-Control': 'private, max-age=31536000, immutable'
  });
  return await filesService.getFileStream(file.fileId, file.metadata?.bucketName || file.bucketName || 'uploads');
});
