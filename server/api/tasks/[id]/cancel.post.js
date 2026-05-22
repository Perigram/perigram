import { createError, readBody } from 'h3';
import { cancelTaskRun } from '~/server/core/tasks/service.js';

export default defineEventHandler(async (event) => {
  requireWorkerToken(event);
  const body = await readBody(event);
  const run = await cancelTaskRun(event.context.params.id, body?.reason || 'Cancelled by worker API');
  return { success: true, run };
});

function requireWorkerToken(event) {
  const expected = process.env.WORKER_TOKEN || process.env.NUXT_WORKER_TOKEN;
  if (!expected) throw createError({ statusCode: 500, message: 'WORKER_TOKEN is required' });
  const actual = event.node.req.headers['x-worker-token'];
  if (actual !== expected) throw createError({ statusCode: 401, message: 'Invalid worker token' });
}
