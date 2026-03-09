import { readMultipartFormData, createError, getQuery, defineEventHandler } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import * as filesService from '../../features/files/service.js';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;

  const formData = await readMultipartFormData(event);
  if (!formData) {
    throw createError({ statusCode: 400, message: 'No form data provided' });
  }

  const file = formData.find(f => f.name === 'file');
  if (!file) {
    throw createError({ statusCode: 400, message: 'No file uploaded' });
  }

  const bucket = getQuery(event).bucket || 'uploads';

  return await filesService.uploadFile(
    file.data,
    file.filename,
    { userId: auth.userId, organizationId: auth.organizationId },
    bucket
  );
});
