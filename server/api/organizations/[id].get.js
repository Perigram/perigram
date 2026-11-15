import { createError, defineEventHandler } from 'h3';
import * as organizationsService from '../../features/organizations/service.js';
import { requireAuth } from '../../utils/permissions.js';
import { serializeForAccess } from '../../utils/entity-redaction.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const id = event.context.params.id;
  const org = await organizationsService.getManagedById(id, auth);
  if (!org) throw createError({ statusCode: 404, message: 'Organization not found' });
  return serializeForAccess('organization', org, auth);
});
