import { defineEventHandler, readBody, getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { serializeForAccess, serializeManyForAccess } from '~/server/utils/entity-redaction.js';
import * as colorService from '~/server/features/colors/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  
  if (event.req.method === 'GET') {
    const filter = getQuery(event);
    const colors = await colorService.list(auth.userId, auth.organizationId, auth.role, auth, filter);
    return serializeManyForAccess('color', colors, auth);
  }
  
  if (event.req.method === 'POST') {
    const body = await readBody(event);
    const color = await colorService.create(body, auth.userId, auth.organizationId, auth.role, auth);
    return serializeForAccess('color', color, auth);
  }
  
  return { error: 'Method not allowed' };
});
