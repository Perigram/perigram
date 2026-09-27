import { createError, defineEventHandler, getRouterParam, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { createBatch } from '~/server/features/instances/batch.js';

// Generic instance batch construction transport (SPEC §13): the
// table-import HTTP surface. One call constructs N rows through the
// type's registered construction mode — `genericCreate` for org types,
// pack-bound modes (cassette-design `bake`) for pack types — with the
// access gate and contract owned by the feature module.
export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const typeId = getRouterParam(event, 'type');
  if (!typeId) {
    throw createError({ statusCode: 400, statusMessage: 'type is required' });
  }
  const body = await readBody(event);
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  return await createBatch({
    registry: getAppRegistry(),
    typeId,
    body: body || {},
    auth,
    organizationId
  });
});
