import { createError } from 'h3';
import { getAppRegistry } from '~/server/runtime/app-registry.js';

// A revision is a frozen view of its source, not a separate visibility
// domain. Resolve the source through the same process-read boundary used by
// ordinary instance GETs so feature grants and tenant scope both apply.
export async function assertRevisionSourceReadable(revision, auth) {
  const source = revision?.data?.source || {};
  if (!source.type || !source.id) {
    throw createError({ statusCode: 404, message: 'Revision source not found' });
  }
  const service = getAppRegistry().getInstanceService(source.type);
  if (typeof service?.processGetById !== 'function') {
    throw createError({ statusCode: 404, message: 'Revision source not found' });
  }
  const organizationId = auth?.organizationId || auth?.memberships?.[0]?.organizationId || null;
  const entity = await service.processGetById(source.id, {
    auth,
    userId: auth?.userId,
    organizationId
  });
  if (!entity) throw createError({ statusCode: 404, message: 'Revision source not found' });
  return entity;
}
