import * as cassetteService from '~/server/features/cassettes/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  try {
    requireAuth(event);
    const auth = event.context.auth;
    const id = event.context.params.id;

    const stream = await cassetteService.downloadDxf(
        id, 
        auth.userId,
        auth.organizationId,
        auth.role,
        auth.permissions
    );

    setResponseHeaders(event, {
      'Content-Type': 'application/dxf'
    });

    return sendStream(event, stream);
  } catch (error) {
    console.error('DXF download error:', error);
    throw error;
  }
});
