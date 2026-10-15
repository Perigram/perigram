export const INSTANCE_CHANGED_EVENT = 'perigram:instance-changed';

export function emitInstanceChanged(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(INSTANCE_CHANGED_EVENT, { detail: normalizeInstanceChangeDetail(detail) }));
}

export function emitInstanceMutation(detail = {}) {
  // Forward the whole detail: extra fields (the acting surface's
  // `origin` token) must reach listeners — the normalizer owns the
  // defaults, rebuilding here would strip them.
  emitInstanceChanged(detail);
}

export function emitInstanceCreated({ type, id, instance = null, reason = 'create', source = 'local' } = {}) {
  emitInstanceMutation({ type, id, instance, change: 'created', reason, source });
}

export function emitInstanceUpdated({ type, id, instance = null, reason = 'update', source = 'local' } = {}) {
  emitInstanceMutation({ type, id, instance, change: 'updated', reason, source });
}

export function emitInstanceDeleted({ type, id, instance = null, reason = 'delete', source = 'local' } = {}) {
  emitInstanceMutation({ type, id, instance, change: 'deleted', reason, source });
}

export function emitStateTransitionResult({ typeId, targetId, response }) {
  emitInstanceMutation({
    type: typeId,
    id: response?.entity?._id || targetId,
    instance: response?.entity,
    change: 'updated',
    reason: 'status-transition'
  });

  for (const changed of normalizedEffectEntities(response?.effects)) {
    emitInstanceMutation({
      type: changed.type,
      id: changed.id || changed.entity?._id,
      instance: changed.entity,
      change: 'updated',
      reason: 'status-transition-effect'
    });
  }
}

function normalizedEffectEntities(effects) {
  if (!effects) return [];
  if (Array.isArray(effects)) {
    return effects.flatMap(effect => effect?.entities || []);
  }
  return effects.entities || [];
}

export function onInstanceChanged(handler) {
  if (typeof window === 'undefined') return () => {};
  const listener = event => handler(event.detail || {});
  window.addEventListener(INSTANCE_CHANGED_EVENT, listener);
  return () => window.removeEventListener(INSTANCE_CHANGED_EVENT, listener);
}

// Self-publication registry: event ids this tab published through
// POST /api/instance-events after applying the mutation's own snapshot.
// The realtime bridge and the cursor poll skip exactly these ids — the
// publishing tab already holds fresher state than the invalidation —
// while other tabs and sessions of the same user reconcile normally.
const SELF_PUBLISHED_WINDOW = 256;
const selfPublishedEventIds = [];

export function markSelfPublished(eventId) {
  if (eventId === null || eventId === undefined) return;
  selfPublishedEventIds.unshift(eventId);
  if (selfPublishedEventIds.length > SELF_PUBLISHED_WINDOW) selfPublishedEventIds.length = SELF_PUBLISHED_WINDOW;
}

export function isSelfPublished(eventId) {
  return eventId !== null && eventId !== undefined && selfPublishedEventIds.includes(eventId);
}

function normalizeInstanceChangeDetail(detail = {}) {
  const snapshot = detail.instance || null;
  const normalizedId = detail.id?.toString?.() || detail.id || snapshot?._id?.toString?.() || snapshot?._id || null;
  return {
    ...detail,
    id: normalizedId,
    change: detail.change || 'updated',
    reason: detail.reason || detail.change || 'updated',
    source: detail.source || 'local'
  };
}
