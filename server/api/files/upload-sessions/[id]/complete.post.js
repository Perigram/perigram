import { defineEventHandler } from 'h3';
import { requireAuth } from '../../../../utils/permissions.js';
import * as filesService from '../../../../features/files/service.js';

// Assembles the session's chunks into the stored file (the descriptor
// shape matches POST /api/files/upload) and deletes the session.
export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  return await filesService.completeUploadSession(event.context.params.id, { userId: auth.userId });
});
