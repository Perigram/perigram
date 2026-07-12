import { defineEventHandler, getRouterParam } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import * as sheetDesignsService from '../../features/sheet-designs/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  return await sheetDesignsService.getById(
    getRouterParam(event, 'id'),
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );
});
