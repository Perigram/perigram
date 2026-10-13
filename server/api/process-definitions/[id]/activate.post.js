import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as service from '~/server/features/process-definitions/service.js';

// Activation carries one optional payload key: `confirmTypeDeath` — the
// author's confirmed consent to the type-lifetime gate (cts SPEC §4), the
// same disclaimer the designer renders before retrying. The migration
// decision remains a declaration on the definition, not a payload.
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}));
  return await service.activate(getRouterParam(event, 'id'), requireAuth(event), {
    confirmTypeDeath: body?.confirmTypeDeath === true
  });
});
