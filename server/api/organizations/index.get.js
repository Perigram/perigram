import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '../../utils/permissions';
import * as organizationsService from '../../features/organizations/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const query = getQuery(event);
  
  return await organizationsService.list(auth.userId, auth.organizationId, auth.role, auth, query);
});