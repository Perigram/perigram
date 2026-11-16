import { defineEventHandler, readBody, setResponseHeader } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as graphExecutionsService from '~/server/features/graph-executions/index.js';

function encodeFilename(value) {
  return encodeURIComponent(value).replace(/['()*]/g, character => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ));
}

export default defineEventHandler(async event => {
  const auth = await requireAuth(event);
  const body = await readBody(event) || {};
  const result = await graphExecutionsService.exportOutput({
    graphDocumentInstanceId: body.graphDocumentInstanceId,
    record: body.record,
    outputId: body.outputId,
    filename: body.filename
  }, auth);
  const asciiFilename = result.filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  setResponseHeader(event, 'Content-Type', result.mimeType);
  setResponseHeader(event, 'Content-Length', String(result.buffer.length));
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeFilename(result.filename)}`);
  setResponseHeader(event, 'Cache-Control', 'no-store');
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff');
  return result.buffer;
});
