import { createError, defineEventHandler, readBody } from 'h3';
import * as geometryCaptureService from '~/server/features/geometry-captures/service.js';

export default defineEventHandler(async (event) => {
  requireWorkerToken(event);
  const body = await readBody(event);
  const capture = await geometryCaptureService.applyExtractionResult(event.context.params.id, body?.result || body || {});
  return { success: true, capture };
});

function requireWorkerToken(event) {
  const expected = process.env.WORKER_TOKEN || process.env.NUXT_WORKER_TOKEN;
  if (!expected) throw createError({ statusCode: 500, message: 'WORKER_TOKEN is required' });
  const actual = event.node.req.headers['x-worker-token'];
  if (actual !== expected) throw createError({ statusCode: 401, message: 'Invalid worker token' });
}
