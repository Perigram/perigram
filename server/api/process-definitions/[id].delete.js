import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as service from '~/server/features/process-definitions/service.js';

// Definition deletion (the designer's Definitions pane remove): deletes
// the definition outright; an active one leaves the active set first —
// the org contract change event re-derives hydration. The type-lifetime
// gate (cts SPEC §4) rides the delete: types no other stored definition
// declares die with their data, behind `confirmTypeDeath` consent.
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}));
  return await service.remove(getRouterParam(event, 'id'), requireAuth(event), {
    confirmTypeDeath: body?.confirmTypeDeath === true
  });
});
