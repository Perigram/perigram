import { defineEventHandler } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import * as designService from '../../features/cassette-designs/service.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const id = event.context.params.id;

  return await designService.getById(
    id,
    auth.userId,
    auth.role,
    auth
  );
});
