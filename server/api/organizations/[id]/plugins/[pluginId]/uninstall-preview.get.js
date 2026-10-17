import { defineEventHandler, getRouterParam } from 'h3';
import { requireAuth } from '../../../../../utils/permissions.js';
import * as pluginsService from '~/server/features/plugins/service.js';

// The uninstall preview (the confirm dialog's consent surface): the
// dependants that ride a cascaded removal and the live data that blocks
// the drain law.
export default defineEventHandler((event) => {
  const auth = requireAuth(event);
  return pluginsService.uninstallPreview({
    organizationId: getRouterParam(event, 'id'),
    pluginId: getRouterParam(event, 'pluginId'),
    auth
  });
});
