import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { requireAuth } from '../../../../utils/permissions.js';
import * as pluginsService from '../../../../features/plugins/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const body = await readBody(event);
  return pluginsService.install({
    organizationId: getRouterParam(event, 'id'),
    pluginId: body?.pluginId,
    auth
  });
});
