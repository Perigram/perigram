import { defineEventHandler, getRouterParam, sendStream, setResponseHeader } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { service } from '~/server/features/artifact-templates';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const file = await service.sourceFile(getRouterParam(event, 'id'), auth);
  setResponseHeader(event, 'Content-Type', file.mimeType || 'application/octet-stream');
  setResponseHeader(event, 'Content-Disposition', `inline; filename="${safeFilename(file.name)}"`);
  return sendStream(event, file.stream);
});

function safeFilename(value = 'template') {
  return String(value).replace(/[\r\n"\\/]/g, '_');
}
