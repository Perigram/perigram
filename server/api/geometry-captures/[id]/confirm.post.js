import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { serializeForAccess } from '~/server/utils/entity-redaction.js';
import * as geometryCaptureService from '~/server/features/geometry-captures/service.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const capture = await geometryCaptureService.confirm(event.context.params.id, auth.userId, auth.organizationId, auth.role, auth);
  return serializeForAccess('geometryCapture', capture, auth);
});
