export const INSTANCE_CHANGED_EVENT = 'cutkit:instance-changed';

export function emitInstanceChanged(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(INSTANCE_CHANGED_EVENT, { detail: normalizeInstanceChangeDetail(detail) }));
}

export function emitInstanceMutation({ type, id, entity = null, change = 'updated', reason = change, source = 'local' } = {}) {
  emitInstanceChanged({
    type,
    id,
    entity,
    change,
    reason,
    source
  });
}

export function emitInstanceCreated({ type, id, entity = null, reason = 'create', source = 'local' } = {}) {
  emitInstanceMutation({ type, id, entity, change: 'created', reason, source });
}

export function emitInstanceUpdated({ type, id, entity = null, reason = 'update', source = 'local' } = {}) {
  emitInstanceMutation({ type, id, entity, change: 'updated', reason, source });
}

export function emitInstanceDeleted({ type, id, entity = null, reason = 'delete', source = 'local' } = {}) {
  emitInstanceMutation({ type, id, entity, change: 'deleted', reason, source });
}

export function emitStatusTransitionResult({ typeId, targetId, response }) {
  emitInstanceMutation({
    type: typeId,
    id: response?.entity?._id || targetId,
    entity: response?.entity,
    change: 'updated',
    reason: 'status-transition'
  });

  for (const changed of normalizedEffectEntities(response?.effects)) {
    emitInstanceMutation({
      type: changed.type,
      id: changed.id || changed.entity?._id,
      entity: changed.entity,
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

function normalizeInstanceChangeDetail(detail = {}) {
  const normalizedId = detail.id?.toString?.() || detail.id || detail.entity?._id?.toString?.() || detail.entity?._id || null;
  return {
    ...detail,
    id: normalizedId,
    change: detail.change || 'updated',
    reason: detail.reason || detail.change || 'updated',
    source: detail.source || 'local'
  };
}
