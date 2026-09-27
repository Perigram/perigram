import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import * as sheetDesignsService from '~/server/packs/facade/sheet-designs/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  return await sheetDesignsService.updateLayout(
    getRouterParam(event, 'id'),
    await readBody(event),
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );
});
