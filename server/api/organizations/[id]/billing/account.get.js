import { defineEventHandler, getRouterParam, getQuery } from 'h3';
import { requireAuth } from '../../../../utils/permissions.js';
import * as billingService from '../../../../features/billing/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  return billingService.getAccountSummary({
    organizationId: getRouterParam(event, 'id'),
    auth,
    limit: getQuery(event).limit
  });
});
