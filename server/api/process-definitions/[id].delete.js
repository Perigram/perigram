import { defineEventHandler, getRouterParam } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as service from '~/server/features/process-definitions/service.js';

// Definition deletion (the designer's Definitions pane remove): deletes
// the definition outright; an active one leaves the active set first —
// the org contract change event re-derives hydration.
export default defineEventHandler(async (event) => {
  return await service.remove(getRouterParam(event, 'id'), requireAuth(event));
});
