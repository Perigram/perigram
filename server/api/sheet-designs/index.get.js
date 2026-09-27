import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import * as sheetDesignsService from '~/server/packs/facade/sheet-designs/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  return await sheetDesignsService.list(
    auth.userId,
    auth.organizationId,
    auth.role,
    auth,
    getQuery(event)
  );
});
