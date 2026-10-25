import { defineEventHandler, getRouterParam, setResponseHeader } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { fetchSurfaceModule } from '~/server/features/plugins/service.js';

// The plugin-module proxy route (the plugins feature README's surface
// module proxy contract): plugin editor/preview modules load same-origin —
// the browser can never reach the server-network executor endpoint the
// install configures. Modules are live executor assets, so they are
// never served from a cache (the app-wide stale-while-revalidate rule
// must not apply — an executor update must reach the next browser load).
export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const pluginId = getRouterParam(event, 'pluginId') || '';
  const modulePath = event.context.params?.path || '';
  const module = await fetchSurfaceModule({ organizationId: auth.organizationId, pluginId, modulePath, auth });
  setResponseHeader(event, 'content-type', module.contentType);
  setResponseHeader(event, 'cache-control', 'no-store');
  return module.body;
});
