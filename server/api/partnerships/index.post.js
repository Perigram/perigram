import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import * as partnershipsService from '../../features/partnerships/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const body = await readBody(event);
  return await partnershipsService.request({ partnerOrganizationId: body?.partnerOrganizationId, auth });
});
