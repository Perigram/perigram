import { defineEventHandler, getQuery, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { serializeForAccess, serializeManyForAccess } from '~/server/utils/entity-redaction.js';
import * as librariesService from '~/server/features/libraries/service';
import * as cassettesService from '~/server/features/cassettes/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);

  if (event.req.method === 'GET') {
    const libraries = await librariesService.list(auth.userId, auth.organizationId, auth.role, auth, getQuery(event));
    const json = serializeManyForAccess('library', libraries, auth);
    const previews = await cassettesService.listPreviewByLibraries(
      json.map(library => library._id),
      auth.userId,
      auth.organizationId,
      auth.role,
      auth,
      { limit: 4 }
    );
    return json.map(library => {
      const libraryId = library._id?.toString?.() || library._id;
      return {
        ...library,
        summary: {
          ...(library.summary || {}),
          cassettePreview: previews[libraryId] || []
        }
      };
    });
  }

  if (event.req.method === 'POST') {
    const body = await readBody(event);
    const library = await librariesService.create(body, auth.userId, auth.organizationId, auth.role, auth);
    return serializeForAccess('library', library, auth);
  }

  return { error: 'Method not allowed' };
});
