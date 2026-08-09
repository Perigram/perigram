import { createError, defineEventHandler, readMultipartFormData } from 'h3';
import { requireAuth } from '../../../utils/permissions.js';
import * as usersService from '../../../features/users/service.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const form = await readMultipartFormData(event);
  const file = form?.find(field => field.name === 'file');
  if (!file?.data?.length) throw createError({ statusCode: 400, message: 'Avatar image is required' });
  const user = await usersService.saveAvatar(event.context.params.id, {
    buffer: file.data,
    filename: file.filename,
    mimeType: file.type
  }, auth);
  return user.toJSON();
});
