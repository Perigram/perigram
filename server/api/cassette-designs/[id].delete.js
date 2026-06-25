import { defineEventHandler } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import * as designService from '../../features/cassette-designs/service.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const id = event.context.params.id;

  const result = await designService.remove(
    id,
    auth.userId,
    auth.role,
    auth
  );

  return { success: Boolean(result?.deletedCount ?? result) };
});
