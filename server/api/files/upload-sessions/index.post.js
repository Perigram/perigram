import { defineEventHandler, readBody, createError } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import * as filesService from '../../features/files/service.js';

// Opens a resumable upload session (the chunk-append contract the chat
// composer uses for big files — see server/api/README.md, files).
export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const body = await readBody(event);
  const bucket = body?.bucket === 'uploads' ? 'uploads' : 'files';
  return await filesService.createUploadSession(
    { fileName: body?.fileName, mimeType: body?.mimeType, size: body?.size },
    { userId: auth.userId, organizationId: auth.organizationId },
    bucket
  );
});
