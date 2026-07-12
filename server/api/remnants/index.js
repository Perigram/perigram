import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '../../utils/permissions';
import { serializeManyForAccess } from '../../utils/entity-redaction.js';
import * as remnantService from '../../features/remnants/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  
  if (event.req.method === 'GET') {
    const query = getQuery(event);
    const remnants = await remnantService.list(auth.userId, auth.organizationId, auth.role, auth, query);
    return serializeManyForAccess('remnant', remnants, auth);
  }
  
  return { error: 'Method not allowed' };
});
