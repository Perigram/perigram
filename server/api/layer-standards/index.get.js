/**
 * GET /api/layer-standards
 * Returns all layer standards. If org user, merges org pen overrides as `orgPenId`.
 */

import { service } from '~/server/features/layer-standards';
import * as repository from '~/server/features/layer-standards/repository.js';

export default defineEventHandler(async (event) => {
  const organizationId = event.context.auth?.organizationId || null;
  const standards = await service.getAll();

  if (!organizationId) return standards;

  const orgOverrides = await repository.findOverridesByOrg(organizationId);
  const overrideMap = Object.fromEntries(orgOverrides.map(o => [o.standardId.toString(), o.penId.toString()]));

  return standards.map(s => ({
    ...s,
    orgPenId: overrideMap[s._id?.toString()] || null
  }));
});
