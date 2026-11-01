import { defineEventHandler, getRequestHeader, getRouterParam, setResponseHeader, setResponseStatus } from 'h3';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { requireAuth } from '~/server/utils/permissions';
import { fetchSurfaceModule } from '~/server/features/plugins/service.js';

const gzipAsync = promisify(gzip);
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml)|image\/svg)/;
const COMPRESS_MIN_BYTES = 1024;

// The plugin-module proxy route (the plugins feature README's surface
// module proxy contract): plugin editor/preview modules load same-origin —
// the browser can never reach the server-network executor endpoint the
// install configures. Every load revalidates against the executor; an
// unchanged module answers 304, and text modules travel gzipped.
export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const pluginId = getRouterParam(event, 'pluginId') || '';
  const modulePath = event.context.params?.path || '';
  const module = await fetchSurfaceModule({ organizationId: auth.organizationId, pluginId, modulePath, auth });

  setResponseHeader(event, 'content-type', module.contentType);
  setResponseHeader(event, 'cache-control', 'private, no-cache');
  setResponseHeader(event, 'etag', module.etag);
  setResponseHeader(event, 'vary', 'accept-encoding');
  if (getRequestHeader(event, 'if-none-match') === module.etag) {
    setResponseStatus(event, 304);
    return '';
  }

  let body = module.body;
  const acceptEncoding = getRequestHeader(event, 'accept-encoding') || '';
  if (body.length >= COMPRESS_MIN_BYTES && /\bgzip\b/.test(acceptEncoding) && COMPRESSIBLE.test(module.contentType)) {
    body = await gzipAsync(body);
    setResponseHeader(event, 'content-encoding', 'gzip');
  }
  setResponseHeader(event, 'content-length', String(body.length));
  return body;
});
