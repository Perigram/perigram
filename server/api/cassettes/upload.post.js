import { service } from '~/server/features/cassettes';
import { readMultipartFormData } from 'h3';

export default defineEventHandler(async (event) => {
  const userId = event.context?.auth?.userId;
  if (!userId) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    });
  }

  const fields = await readMultipartFormData(event);
  
  const fileField = fields.find(f => f.name === 'file');
  const nameField = fields.find(f => f.name === 'name');
  
  if (!fileField) {
    throw createError({
      statusCode: 400,
      message: 'No file uploaded'
    });
  }

  const name = nameField?.data?.toString() || 'Unnamed Cassette';
  const fileName = fileField.filename || 'cassette.dxf';
  const fileBuffer = fileField.data;
  
  return await service.upload(fileBuffer, fileName, name, userId);
});
