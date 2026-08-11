import { createError, defineEventHandler, readBody } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import { serializeForAccess } from '../../utils/entity-redaction.js';
import * as machinesService from '../../features/machines/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const id = event.context.params.id;
  if (event.req.method === 'GET') {
    return serializeForAccess('machine', await machinesService.getById(id, auth.userId, auth.organizationId, auth.role, auth), auth);
  }
  if (event.req.method === 'PUT' || event.req.method === 'PATCH') {
    return serializeForAccess('machine', await machinesService.update(id, await readBody(event), auth.userId, auth.organizationId, auth.role, auth), auth);
  }
  if (event.req.method === 'DELETE') {
    return await machinesService.remove(id, auth.userId, auth.organizationId, auth.role, auth);
  }
  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
