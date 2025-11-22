import { service } from '~/server/features/cassettes';

export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId;
  
  const form = await readMultipartFormData(event);
  if (!form) {
    throw createError({ statusCode: 400, message: 'No file provided' });
  }

  const fileEntry = form.find(entry => entry.name === 'file');
  if (!fileEntry) {
    throw createError({ statusCode: 400, message: 'No file in form data' });
  }

  try {
    const result = await service.detectLayers(userId, fileEntry);
    return result;
  } catch (error) {
    console.error('Layer detection failed:', error);
    throw createError({ 
      statusCode: 500, 
      message: error.message || 'Layer detection failed' 
    });
  }
});
