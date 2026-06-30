import { defineEventHandler, getRouterParam, getQuery, readBody } from 'h3';
import { requireAuth } from '../../../../utils/permissions.js';
import * as billingService from '../../../../features/billing/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const body = await readBody(event);
  const query = getQuery(event);
  return billingService.syncPaymentByCheckoutInternalId({
    organizationId: getRouterParam(event, 'id'),
    checkoutInternalId: body?.checkoutInternalId || query.checkoutInternalId,
    auth
  });
});
