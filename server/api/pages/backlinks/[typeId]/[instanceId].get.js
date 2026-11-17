import { defineEventHandler, getRouterParam } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as pagesService from '~/server/features/pages/service.js';

export default defineEventHandler(async event => {
  const auth = await requireAuth(event);
  return pagesService.findBacklinks(getRouterParam(event, 'typeId') || '', getRouterParam(event, 'instanceId') || '', auth);
});
