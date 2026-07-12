import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { serializeForAccess } from '~/server/utils/entity-redaction.js';
import * as geometryCaptureService from '~/server/features/geometry-captures/service.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const body = await readBody(event);
  const capture = await geometryCaptureService.createManualRevision(
    event.context.params.id,
    body || {},
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );
  return serializeForAccess('geometryCapture', capture, auth);
});
