import { defineEventHandler, getQuery, setResponseHeader, sendStream } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as cassetteService from '~/server/packs/facade/cassettes/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const id = event.context.params.id;
  const query = getQuery(event);
  
  // Extract parameters from query
  const dimensions = {};
  Object.keys(query).forEach(key => {
    if (key !== 'bucket') { // exclude reserved keys if any
      const val = parseFloat(query[key]);
      if (!isNaN(val)) dimensions[key] = val;
    }
  });

  const result = await cassetteService.exportDxf(
    id,
    dimensions,
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );

  setResponseHeader(event, 'Content-Disposition', `attachment; filename="cassette-${id}.dxf"`);
  setResponseHeader(event, 'Content-Type', 'application/dxf');

  if (typeof result === 'string') {
    return result;
  } else {
    return sendStream(event, result);
  }
});