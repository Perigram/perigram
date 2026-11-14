import { defineEventHandler, getHeader, getRouterParam, readRawBody, getQuery } from 'h3';
import { requirePlatformOperator } from '~/server/utils/permissions';
import * as pluginsService from '../../../../../features/plugins/service.js';

// A client-carried package asset (SPEC §20): the operator PUTs the
// engine's modules and runtime files beside the listing, keyed by the
// `version` query parameter. The module proxy serves them same-origin
// to organizations holding the install.
export default defineEventHandler(async (event) => {
  requirePlatformOperator(event);
  const pluginId = getRouterParam(event, 'pluginId') || '';
  const path = event.context.params?.path || '';
  const body = await readRawBody(event, false);
  return await pluginsService.publishPluginAsset({
    pluginId,
    version: String(getQuery(event).version || ''),
    path,
    body,
    contentType: getHeader(event, 'content-type') || ''
  });
});
