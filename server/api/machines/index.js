import { createError, defineEventHandler, readBody } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import { serializeForAccess, serializeManyForAccess } from '../../utils/entity-redaction.js';
import * as machinesService from '../../features/machines/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  if (event.req.method === 'GET') {
    const machines = await machinesService.list(auth.userId, auth.organizationId, auth.role, auth);
    return serializeManyForAccess('machine', machines, auth);
  }
  if (event.req.method === 'POST') {
    const machine = await machinesService.create(await readBody(event), auth.userId, auth.organizationId, auth.role, auth);
    return serializeForAccess('machine', machine, auth);
  }
  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
