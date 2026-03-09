import { createError, sendStream, getQuery, defineEventHandler } from 'h3';
import * as filesService from '../../../features/files/service.js';

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
