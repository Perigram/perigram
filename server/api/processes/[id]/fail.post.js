import { createError, readBody } from 'h3';
import { failProcessRun } from '~/server/core/processes/service.js';

export default defineEventHandler(async (event) => {
  requireWorkerToken(event);
  const body = await readBody(event);
  const run = await failProcessRun(event.context.params.id, new Error(body?.message || 'Process failed'), body?.claimToken || null);
  return { success: true, run };
});

function requireWorkerToken(event) {
  const expected = process.env.WORKER_TOKEN || process.env.NUXT_WORKER_TOKEN;
  if (!expected) return;
  const actual = event.node.req.headers['x-worker-token'];
  if (actual !== expected) throw createError({ statusCode: 401, message: 'Invalid worker token' });
}
