import { defineEventHandler } from 'h3';
import { requireAuth } from '../../../utils/permissions.js';
import * as directoryService from '../../../features/directory/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const { type, id } = event.context.params;
  return await directoryService.getEntry(auth, type, id);
});
