import { createError, sendStream, getQuery, getRequestHeader, setResponseHeaders, setResponseStatus, defineEventHandler } from 'h3';
import * as filesService from '../../../features/files/service.js';

// Inline-first serving: declared previews (SVG documents, PDFs, images,
// canvases) fetch this endpoint into image/iframe contexts that refuse
// sniffed or octet-stream responses, so the stored file's content type is
// resolved and sent on every response. `?download=1` flips the
// disposition to an explicit download. Media playback rides HTTP byte
// ranges (`Range` → 206 + `Content-Range`): video elements seek and often
// refuse to play at all without range support; unparseable or
// unsatisfiable ranges degrade to the full 200 body.
export default defineEventHandler(async (event) => {
  const id = event.context.params.id;
  const query = getQuery(event);
  const bucket = query.bucket || 'uploads';

  try {
    const meta = await filesService.findFileMeta(id, bucket);
    if (!meta) throw new Error('not found');
    const contentType = filesService.contentTypeForFile(meta);
    const disposition = query.download === '1' ? 'attachment' : 'inline';
    const baseHeaders = {
      'Content-Type': contentType,
      'Content-Disposition': `${disposition}; filename="${meta.filename.replace(/"/g, '')}"`
    };

    const total = Number(meta.length) || 0;
    const range = total ? parseRangeHeader(getRequestHeader(event, 'range'), total) : null;

    if (range) {
      setResponseHeaders(event, {
        ...baseHeaders,
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${range.start}-${range.end}/${total}`,
        'Content-Length': String(range.end - range.start + 1)
      });
      setResponseStatus(event, 206);
      const stream = await filesService.getFileRangeStream(id, bucket, range.start, range.end);
      return sendStream(event, stream);
    }

    setResponseHeaders(event, {
      ...baseHeaders,
      ...(total ? { 'Accept-Ranges': 'bytes', 'Content-Length': String(total) } : {})
    });
    const stream = await filesService.getFileStream(id, bucket);
    return sendStream(event, stream);
  } catch (err) {
    throw createError({ statusCode: 404, message: 'File not found' });
  }
});

// Single ranges only (`bytes=a-b`, `bytes=a-`, `bytes=-n` suffix);
// anything else — including multi-range — falls back to the full body.
function parseRangeHeader(header, total) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!match || (match[1] === '' && match[2] === '')) return null;
  let start;
  let end;
  if (match[1] === '') {
    const suffix = Math.min(Number(match[2]), total);
    start = total - suffix;
    end = total - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? total - 1 : Math.min(Number(match[2]), total - 1);
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || start >= total) return null;
  return { start, end };
}
