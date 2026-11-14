import { defineEventHandler, readBody } from 'h3';
import { requirePlatformOperator } from '~/server/utils/permissions';
import * as pluginsService from '../../features/plugins/service.js';

// Platform-side publishing (SPEC §Plugin marketplace: the catalog is
// platform-published; orgs never write it). The body is a listing
// validated by the one contract home (@perigram/plugin-sdk's
// parseListing).
export default defineEventHandler(async (event) => {
  requirePlatformOperator(event);
  const listing = await readBody(event);
  return await pluginsService.publishListing(listing);
});
