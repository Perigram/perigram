import { service } from '~/server/features/batches';

export default defineEventHandler(async (event) => {
  try {
    const userId = event.context.auth.userId;
    const batchId = getRouterParam(event, 'id');
    const runId = getRouterParam(event, 'runId');
    
    return await service.removeRun(batchId, runId, userId);
  } catch (error) {
    console.error('Delete run error:', error);
    throw error;
  }
});
