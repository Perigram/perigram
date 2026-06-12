import { defineEventHandler, sendStream, setResponseHeader } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as designService from '~/server/features/cassette-designs/service.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const id = event.context.params.id;
  const result = await designService.exportDxf(
    id,
    auth.userId,
    auth.role,
    auth
  );

  setResponseHeader(event, 'Content-Disposition', `attachment; filename="cassette-design-${id}.dxf"`);
  setResponseHeader(event, 'Content-Type', 'application/dxf');

  if (typeof result === 'string') {
    return result;
  }

  return sendStream(event, result);
});
