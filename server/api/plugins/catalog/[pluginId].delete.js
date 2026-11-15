import { defineEventHandler } from 'h3';
import { requirePlatformOperator } from '../../../utils/permissions.js';
import * as pluginsService from '../../../features/plugins/service.js';

// Retract a catalog listing (the publish route's counterpart, same
// operator credential): the listing leaves the catalog; organizations
// still holding an install refuse the retraction (they would strand
// without an upgrade path). Installed pins are snapshots, so a retracted
// and later re-published listing re-becomes upgradeable normally.
export default defineEventHandler(async (event) => {
  requirePlatformOperator(event);
  const pluginId = event.context.params?.pluginId;
  return await pluginsService.retractListing(pluginId);
});
