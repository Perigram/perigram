import { createError, sendStream } from 'h3';
import * as filesService from '~/server/features/files/service';

export default defineEventHandler(async (event) => {
  const id = event.context.params.id;
  const bucket = getQuery(event).bucket || 'uploads';
  
  try {
    const stream = await filesService.getFileStream(id, bucket);
    return sendStream(event, stream);
  } catch (err) {
    throw createError({ statusCode: 404, message: 'File not found' });
  }
});
