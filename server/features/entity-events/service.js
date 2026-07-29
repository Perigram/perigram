const subscribers = new Map();
const automaticHandlers = new Set();
let nextSubscriberId = 1;
let nextEventId = 1;

export function subscribe(auth = {}, push) {
  if (!auth.userId || typeof push !== 'function') return () => {};
  const subscriberId = nextSubscriberId++;
  subscribers.set(subscriberId, {
    auth: normalizeAuth(auth),
    push
  });
  return () => {
    subscribers.delete(subscriberId);
  };
}

export function registerAutomaticHandler(handler) {
  if (typeof handler !== 'function') return () => {};
  automaticHandlers.add(handler);
  return () => automaticHandlers.delete(handler);
}

export async function publishEntityChanged(auth = {}, detail = {}) {
  const event = normalizeEvent(auth, detail);
  if (!event) return null;

  const payload = JSON.stringify({
    type: 'entityChanged',
    data: event
  });

  await Promise.all([...subscribers.values()]
    .filter(subscriber => canReceive(subscriber.auth, event))
    .map(subscriber => subscriber.push(payload).catch(() => null)));
  await Promise.all([...automaticHandlers].map(handler => (
    Promise.resolve().then(() => handler(event, auth)).catch(error => {
      console.error('[Entity Events] Automatic process trigger failed:', error.message);
    })
  )));

  return event;
}

function normalizeEvent(auth = {}, detail = {}) {
  const type = detail.type || detail.entityType;
  const id = detail.id?.toString?.() || detail.id || detail.entity?._id?.toString?.() || detail.entity?._id;
  if (!type || !id) return null;

  const actorUserId = auth.userId?.toString?.() || auth.userId || null;
  const organizationId = detail.organizationId?.toString?.()
    || detail.organizationId
    || auth.organizationId?.toString?.()
    || auth.organizationId
    || null;

  return {
    eventId: nextEventId++,
    type,
    id,
    change: detail.change || 'updated',
    reason: detail.reason || detail.change || 'updated',
    source: detail.source || 'server',
    actorUserId,
    organizationId,
    timestamp: new Date().toISOString()
  };
}

function normalizeAuth(auth = {}) {
  return {
    userId: auth.userId?.toString?.() || auth.userId || null,
    organizationId: auth.organizationId?.toString?.() || auth.organizationId || null,
    isAdmin: Boolean(auth.isAdmin)
  };
}

function canReceive(auth = {}, event = {}) {
  if (!auth.userId) return false;
  if (auth.isAdmin) return true;
  if (event.actorUserId && event.actorUserId === auth.userId) return true;
  return Boolean(event.organizationId && auth.organizationId && event.organizationId === auth.organizationId);
}
