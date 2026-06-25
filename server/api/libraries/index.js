import { defineEventHandler, getQuery, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { serializeForAccess, serializeManyForAccess } from '~/server/utils/entity-redaction.js';
import * as librariesService from '~/server/features/libraries/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);

  if (event.req.method === 'GET') {
    const libraries = await librariesService.list(auth.userId, auth.organizationId, auth.role, auth, getQuery(event));
    return serializeManyForAccess('library', libraries, auth);
  }

  if (event.req.method === 'POST') {
    const body = await readBody(event);
    const library = await librariesService.create(body, auth.userId, auth.organizationId, auth.role, auth);
    return serializeForAccess('library', library, auth);
  }

  return { error: 'Method not allowed' };
});
