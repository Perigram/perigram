import { defineEventHandler } from 'h3';
import { requireAuth } from '../../../../utils/permissions.js';
import * as filesService from '../../../../features/files/service.js';

// Session resume state: which chunk indexes the server already holds.
export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  return await filesService.getUploadSession(event.context.params.id, { userId: auth.userId });
});
