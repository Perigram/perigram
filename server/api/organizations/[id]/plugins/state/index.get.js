import { defineEventHandler, getRouterParam } from 'h3';
import { requireAuth } from '../../../../../utils/permissions.js';
import * as pluginsService from '../../../../../features/plugins/service.js';

export default defineEventHandler((event) => {
  const auth = requireAuth(event);
  return pluginsService.listPackState({
    organizationId: getRouterParam(event, 'id'),
    auth
  });
});
