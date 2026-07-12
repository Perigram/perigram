import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { requireAuth } from '../../../../utils/permissions.js';
import * as billingService from '../../../../features/billing/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const body = await readBody(event);
  return billingService.createCheckout({
    organizationId: getRouterParam(event, 'id'),
    packageId: body?.packageId,
    auth
  });
});
