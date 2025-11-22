import { readMultipartFormData } from 'h3';
import { service } from '~/server/features/cassettes';

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
  
  if (!fileField) {
    throw createError({
      statusCode: 400,
      message: 'No file uploaded'
    });
  }

  const fileBuffer = fileField.data;
  
  // Analyze without saving
  return await service.analyzeFile(fileBuffer);
});
