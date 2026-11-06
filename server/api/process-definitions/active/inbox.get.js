import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { getActiveActionInbox } from '~/server/features/process-definitions/action-inbox.js';

export default defineEventHandler(async (event) => {
  return await getActiveActionInbox(requireAuth(event));
});
