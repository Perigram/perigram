import { defineEventHandler, getRouterParam } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as service from '~/server/features/process-definitions/service.js';

// Deactivation removes the definition from the additive active set
// (feature README "Activation"); state returns to DRAFT.
export default defineEventHandler(async (event) => {
  return await service.deactivate(getRouterParam(event, 'id'), requireAuth(event));
});
