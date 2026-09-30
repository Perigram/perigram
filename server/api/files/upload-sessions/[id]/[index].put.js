import { defineEventHandler, readRawBody, createError } from 'h3';
import { requireAuth } from '../../../../utils/permissions.js';
import * as filesService from '../../../../features/files/service.js';

// Appends (idempotently) one raw-bytes chunk to the caller's session.
export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const buffer = await readRawBody(event, false);
  if (!buffer?.length) {
    throw createError({ statusCode: 400, message: 'Chunk body is required' });
  }
  return await filesService.appendUploadChunk(
    event.context.params.id,
    event.context.params.index,
    Buffer.from(buffer),
    { userId: auth.userId }
  );
});
