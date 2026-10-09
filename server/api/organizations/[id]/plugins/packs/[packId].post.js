import { defineEventHandler, getRouterParam } from 'h3';
import { requireAuth } from '../../../../../utils/permissions.js';
import * as pluginsService from '../../../../../features/plugins/service.js';

export default defineEventHandler((event) => {
  const auth = requireAuth(event);
  return pluginsService.enablePack({
    organizationId: getRouterParam(event, 'id'),
    packId: getRouterParam(event, 'packId'),
    auth
  });
});
