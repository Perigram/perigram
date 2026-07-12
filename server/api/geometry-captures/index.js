import { defineEventHandler, getQuery, readBody } from 'h3';
import { requireAuth } from '../../utils/permissions';
import { serializeForAccess, serializeManyForAccess } from '../../utils/entity-redaction.js';
import * as geometryCaptureService from '../../features/geometry-captures/service.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);

  if (event.req.method === 'GET') {
    const captures = await geometryCaptureService.list(auth.userId, auth.organizationId, auth.role, auth, getQuery(event));
    return serializeManyForAccess('geometryCapture', captures, auth);
  }

  if (event.req.method === 'POST') {
    const body = await readBody(event);
    const capture = await geometryCaptureService.create(body, auth.userId, auth.organizationId, auth.role, auth);
    return serializeForAccess('geometryCapture', capture, auth);
  }

  return { error: 'Method not allowed' };
});
