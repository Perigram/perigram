import { service } from '~/server/features/cassettes';

export default defineEventHandler(async (event) => {
  try {
    const userId = event.context.auth?.userId;
    if (!userId) {
      throw createError({ statusCode: 401, message: 'Unauthorized' });
    }

    const id = getRouterParam(event, 'id');
    const stream = await service.downloadDxf(id, userId);

    setResponseHeaders(event, {
      'Content-Type': 'application/dxf'
    });

    return sendStream(event, stream);
  } catch (error) {
    console.error('DXF download error:', error);
    throw error;
  }
});
