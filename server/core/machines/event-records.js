import { normalizeStatusLifecycle } from '#packages/core';

export function buildStatusEventRecord({
  eventId,
  targetId,
  targetType,
  fromState,
  toState,
  fromStatePrimary,
  toStatePrimary,
  region,
  statusData,
  actor,
  operation,
  evidence,
  source = null
}) {
  return {
    _id: eventId,
    targetId,
    targetType,
    fromState,
    toState,
    fromStatePrimary,
    toStatePrimary,
    region,
    status: statusData,
    actor,
    operation,
    evidence,
    ...(source ? { source } : {}),
    timestamp: new Date()
  };
}

export function buildEventActor(auth = {}, actorId) {
  const label = auth?.name || auth?.label || null;
  return {
    id: actorId,
    ...(label ? { label } : {}),
    principalType: resolveEventPrincipalType(actorId, auth)
  };
}

function resolveEventPrincipalType(actorId, auth = {}) {
  if (auth?.system === true || actorId === 'SYSTEM') return 'SYSTEM';
  return /^(service|principal)_/.test(String(actorId)) ? 'service' : 'user';
}

export function buildEventEvidence(metadata = {}, lifecycle = {}) {
  const normalized = normalizeStatusLifecycle(lifecycle);
  return {
    description: metadata?.note || metadata?.description || null,
    attachments: normalized.attachments,
    lifecycle: normalized
  };
}
