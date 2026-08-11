import { defineEventHandler, sendStream, setResponseHeaders } from 'h3';
import { requireAuth } from '../../../utils/permissions.js';
import * as usersService from '../../../features/users/service.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const avatar = await usersService.getAvatar(event.context.params.id, auth);
  setResponseHeaders(event, {
    'Content-Type': avatar.mimeType,
    'Cache-Control': 'private, max-age=86400'
  });
  return sendStream(event, avatar.stream);
});
