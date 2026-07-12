/**
 * GET /api/layer-standards
 * Returns all layer standards. If org user, merges org pen overrides as `orgPenId`.
 */

import { service } from '~/server/features/layer-standards';
import { serializeManyForAccess } from '~/server/utils/entity-redaction.js';

export default defineEventHandler(async (event) => {
  const auth = event.context.auth || null;
  const organizationId = auth?.organizationId || null;
  const standards = await service.getAll();

  if (!organizationId) return serializeManyForAccess('layerStandard', standards, auth);

  const orgOverrides = await service.getOverridesForOrg(organizationId);
  const overrideMap = Object.fromEntries(orgOverrides.map(o => [o.standardId.toString(), o.penId.toString()]));

  const mergedStandards = standards.map(s => {
    const orgPenId = overrideMap[s._id?.toString()] || null;
    return {
      ...s,
      orgPenId,
      data: {
        ...(s.data || {}),
        orgPenId
      }
    };
  });
  return serializeManyForAccess('layerStandard', mergedStandards, auth);
});
