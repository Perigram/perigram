import { defineEventHandler, getRouterParam } from 'h3';
import { requireAuth } from '../../../../utils/permissions.js';
import * as billingService from '../../../../features/billing/service.js';

export default defineEventHandler((event) => {
  const auth = requireAuth(event);
  const runtimeConfig = useRuntimeConfig();
  return {
    packages: billingService.listPackagesForOrganization({
      organizationId: getRouterParam(event, 'id'),
      auth,
      runtimeConfig
    }),
    billing: billingService.getConfiguration(runtimeConfig)
  };
});
