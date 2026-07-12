import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { serializeForAccess } from '~/server/utils/entity-redaction.js';
import * as geometryCaptureService from '~/server/features/geometry-captures/service.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const id = event.context.params.id;

  if (event.req.method === 'GET') {
    const capture = await geometryCaptureService.getById(id, auth.userId, auth.organizationId, auth.role, auth);
    return serializeForAccess('geometryCapture', capture, auth);
  }

  if (event.req.method === 'PUT' || event.req.method === 'PATCH') {
    const body = await readBody(event);
    const capture = await geometryCaptureService.update(id, body, auth.userId, auth.organizationId, auth.role, auth);
    return serializeForAccess('geometryCapture', capture, auth);
  }

  if (event.req.method === 'DELETE') {
    return await geometryCaptureService.remove(id, auth.userId, auth.organizationId, auth.role, auth);
  }

  return { error: 'Method not allowed' };
});
