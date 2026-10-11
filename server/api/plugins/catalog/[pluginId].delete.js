import { defineEventHandler, createError, getHeader } from 'h3';
import * as pluginsService from '../../../features/plugins/service.js';

// Retract a catalog listing (the publish route's counterpart, same
// operator credential): the listing leaves the catalog; organizations
// still holding an install refuse the retraction (they would strand
// without an upgrade path). Installed pins are snapshots, so a retracted
// and later re-published listing re-becomes upgradeable normally.
export default defineEventHandler(async (event) => {
  const expected = process.env.PLATFORM_OPERATOR_TOKEN || process.env.NUXT_PLATFORM_OPERATOR_TOKEN;
  if (!expected) {
    throw createError({ statusCode: 503, message: 'Plugin publishing is not configured — set PLATFORM_OPERATOR_TOKEN' });
  }
  if (getHeader(event, 'x-operator-token') !== expected) {
    throw createError({ statusCode: 401, message: 'Invalid operator token' });
  }
  const pluginId = event.context.params?.pluginId;
  return await pluginsService.retractListing(pluginId);
});
