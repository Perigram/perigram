import { defineEventHandler } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import * as partnershipsService from '../../features/partnerships/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  return await partnershipsService.listForActiveOrganization(auth);
});
