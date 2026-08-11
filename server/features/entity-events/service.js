const subscribers = new Map();
const recentEvents = [];
const MAX_RECENT_EVENTS = 500;
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

export async function publishEntityChanged(auth = {}, detail = {}) {
  const event = normalizeEvent(auth, detail);
  if (!event) return null;

  const payload = JSON.stringify({
    type: 'entityChanged',
    data: event
  });

  recentEvents.push(event);
  if (recentEvents.length > MAX_RECENT_EVENTS) recentEvents.shift();

  await Promise.all([...subscribers.values()]
    .filter(subscriber => canReceive(subscriber.auth, event))
    .map(subscriber => subscriber.push(payload).catch(() => null)));

  return event;
}

export function listEntityChanges(auth = {}, { after = null } = {}) {
  const normalizedAuth = normalizeAuth(auth);
  const cursor = nextEventId - 1;
  if (after === null || !Number.isFinite(after)) return { cursor, events: [] };

  return {
    cursor,
    events: recentEvents.filter(event => event.eventId > after && canReceive(normalizedAuth, event))
  };
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
