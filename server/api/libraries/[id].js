import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { serializeForAccess } from '~/server/utils/entity-redaction.js';
import * as librariesService from '~/server/features/libraries/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const id = event.context.params.id;

  if (event.req.method === 'GET') {
    const library = await librariesService.getById(id, auth.userId, auth.organizationId, auth.role, auth);
    return serializeForAccess('library', library, auth);
  }

  if (event.req.method === 'PUT' || event.req.method === 'PATCH') {
    const body = await readBody(event);
    const library = await librariesService.update(id, body, auth.userId, auth.organizationId, auth.role, auth);
    return serializeForAccess('library', library, auth);
  }

  if (event.req.method === 'DELETE') {
    return await librariesService.remove(id, auth.userId, auth.organizationId, auth.role, auth);
  }

  return { error: 'Method not allowed' };
});
