import { createError, sendStream, getQuery, setResponseHeaders, defineEventHandler } from 'h3';
import * as filesService from '../../../features/files/service.js';

// Inline-first serving: declared previews (SVG documents, PDFs, images,
// canvases) fetch this endpoint into image/iframe contexts that refuse
// sniffed or octet-stream responses, so the stored file's content type is
// resolved and sent on every response. `?download=1` flips the
// disposition to an explicit download.
export default defineEventHandler(async (event) => {
  const id = event.context.params.id;
  const query = getQuery(event);
  const bucket = query.bucket || 'uploads';

  try {
    const meta = await filesService.findFileMeta(id, bucket);
    if (!meta) throw new Error('not found');
    const contentType = filesService.contentTypeForFile(meta);
    const disposition = query.download === '1' ? 'attachment' : 'inline';
    setResponseHeaders(event, {
      'Content-Type': contentType,
      'Content-Disposition': `${disposition}; filename="${meta.filename.replace(/"/g, '')}"`
    });
    const stream = await filesService.getFileStream(id, bucket);
    return sendStream(event, stream);
  } catch (err) {
    throw createError({ statusCode: 404, message: 'File not found' });
  }
});
