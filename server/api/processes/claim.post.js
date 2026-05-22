import { createError, readBody } from 'h3';
import { claimProcess } from '~/server/core/processes/service.js';

export default defineEventHandler(async (event) => {
  requireWorkerToken(event);
  const body = await readBody(event);
  const run = await claimProcess({
    processId: body?.processId || null,
    workerId: body?.workerId || 'worker',
    leaseMs: body?.leaseMs || 60000
  });
  return { success: true, run };
});

function requireWorkerToken(event) {
  const expected = process.env.WORKER_TOKEN || process.env.NUXT_WORKER_TOKEN;
  if (!expected) return;
  const actual = event.node.req.headers['x-worker-token'];
  if (actual !== expected) throw createError({ statusCode: 401, message: 'Invalid worker token' });
}
