import { defineEventHandler, readBody, getQuery } from 'h3';
import { requireAuth } from '../../utils/permissions';
import { serializeForAccess, serializeManyForAccess } from '../../utils/entity-redaction.js';
import * as catalogService from '../../features/catalogs/service';
import * as colorService from '../../features/colors/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  
  if (event.req.method === 'GET') {
    const query = getQuery(event);
    const catalogs = await catalogService.list(auth.userId, auth.organizationId, auth.role, auth, query);
    const json = serializeManyForAccess('catalog', catalogs, auth);
    const previews = await colorService.listPreviewByCatalogs(
      json.map(catalog => catalog._id),
      auth.userId,
      auth.organizationId,
      auth.role,
      auth,
      { limit: 4 }
    );
    return json.map(catalog => {
      const catalogId = catalog._id?.toString?.() || catalog._id;
      return {
        ...catalog,
        summary: {
          ...(catalog.summary || {}),
          colorPreview: previews[catalogId] || []
        }
      };
    });
  }
  
  if (event.req.method === 'POST') {
    const body = await readBody(event);
    const catalog = await catalogService.create(body, auth.userId, auth.organizationId, auth.role, auth);
    return serializeForAccess('catalog', catalog, auth);
  }
  
  return { error: 'Method not allowed' };
});
