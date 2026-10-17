import { defineEventHandler, getRouterParam, getQuery } from 'h3';
import { requireAuth } from '../../../../utils/permissions.js';
import * as pluginsService from '../../../../features/plugins/service.js';

export default defineEventHandler((event) => {
  const auth = requireAuth(event);
  return pluginsService.uninstall({
    organizationId: getRouterParam(event, 'id'),
    pluginId: getRouterParam(event, 'pluginId'),
    cascade: getQuery(event).cascade === '1',
    auth
  });
});
