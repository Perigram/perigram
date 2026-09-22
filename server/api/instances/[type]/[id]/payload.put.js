import { createError, defineEventHandler, getRouterParam, readMultipartFormData } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { getAppRegistry } from '~/server/runtime/app-registry.js';

// Payload replacement transport (SPEC §3 editor concern): multipart file
// in, revisioned payload swap through the generic instance service. The
// service owns trait validation, revisioning, and the access gate.
export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const typeId = getRouterParam(event, 'type');
  const id = getRouterParam(event, 'id');
  if (!typeId || !id) {
    throw createError({ statusCode: 400, statusMessage: 'type and id are required' });
  }
  const service = getAppRegistry().getInstanceService(typeId);
  if (!service || typeof service.replacePayload !== 'function') {
    throw createError({ statusCode: 404, statusMessage: `no instance service for type ${typeId}` });
  }
  const formData = await readMultipartFormData(event);
  const file = formData?.find(part => part.name === 'file');
  if (!file) {
    throw createError({ statusCode: 400, statusMessage: 'file is required' });
  }
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  return await service.replacePayload(id, {
    buffer: file.data,
    filename: file.filename,
    mimeType: file.type || null
  }, { auth, userId: auth.userId, organizationId });
});
