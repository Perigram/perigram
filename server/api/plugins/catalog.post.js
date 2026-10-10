import { defineEventHandler, readBody, createError, getHeader } from 'h3';
import * as pluginsService from '../../features/plugins/service.js';

// Platform-side publishing (SPEC §Plugin marketplace: the catalog is
// platform-published; orgs never write it). The operator credential is the
// deployment's PLATFORM_OPERATOR_TOKEN — the same shape the worker
// endpoints give WORKER_TOKEN. The body is a listing validated by the one
// contract home (@perigram/plugin-sdk's parseListing).
export default defineEventHandler(async (event) => {
  const expected = process.env.PLATFORM_OPERATOR_TOKEN || process.env.NUXT_PLATFORM_OPERATOR_TOKEN;
  if (!expected) {
    throw createError({ statusCode: 503, message: 'Plugin publishing is not configured — set PLATFORM_OPERATOR_TOKEN' });
  }
  if (getHeader(event, 'x-operator-token') !== expected) {
    throw createError({ statusCode: 401, message: 'Invalid operator token' });
  }
  const listing = await readBody(event);
  return await pluginsService.publishListing(listing);
});
