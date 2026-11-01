import { defineEventHandler, getRequestHeader, getRouterParam, setResponseHeader, setResponseStatus } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { fetchSurfaceModule } from '~/server/features/plugins/service.js';

// The plugin-module proxy route (the plugins feature README's surface
// module proxy contract): plugin editor/preview modules load same-origin —
// the browser can never reach the server-network executor endpoint the
// install configures. Every load revalidates against the executor; an
// unchanged module answers 304.
export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const pluginId = getRouterParam(event, 'pluginId') || '';
  const modulePath = event.context.params?.path || '';
  const module = await fetchSurfaceModule({ organizationId: auth.organizationId, pluginId, modulePath, auth });

  setResponseHeader(event, 'content-type', module.contentType);
  setResponseHeader(event, 'cache-control', 'private, no-cache');
  setResponseHeader(event, 'etag', module.etag);
  if (getRequestHeader(event, 'if-none-match') === module.etag) {
    setResponseStatus(event, 304);
    return '';
  }
  return module.body;
});
