export const ENTITY_CHANGED_EVENT = 'cutkit:entity-changed';

export function emitEntityChanged(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ENTITY_CHANGED_EVENT, { detail }));
}

export function emitStatusTransitionResult({ entityType, targetId, response }) {
  emitEntityChanged({
    type: entityType,
    id: response?.entity?._id || targetId,
    entity: response?.entity,
    reason: 'status-transition'
  });

  for (const changed of normalizedEffectEntities(response?.effects)) {
    emitEntityChanged({
      type: changed.type,
      id: changed.id || changed.entity?._id,
      entity: changed.entity,
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

export function onEntityChanged(handler) {
  if (typeof window === 'undefined') return () => {};
  const listener = event => handler(event.detail || {});
  window.addEventListener(ENTITY_CHANGED_EVENT, listener);
  return () => window.removeEventListener(ENTITY_CHANGED_EVENT, listener);
}
