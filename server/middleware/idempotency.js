import { findExecutedKey } from '../core/idempotency/service.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export default defineEventHandler(async (event) => {
  if (!MUTATING_METHODS.has(event.method)) return;
  if (!event.path.startsWith('/api/')) return;
  const key = getHeader(event, 'idempotency-key');
  if (!key) return;
  const existing = await findExecutedKey(key);
  if (existing) {
    return { duplicate: true, firstSeenAt: existing.createdAt };
  }
  event.context.idempotency = {
    key,
    userId: event.context.auth?.userId || null,
    method: event.method,
    url: event.path
  };
});
