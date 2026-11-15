import { createError } from 'h3';
import { toFlexibleId } from '../../utils/objectid.js';
import { getPrimaryState, normalizeStatusLifecycle } from '#packages/core';
import { hasInstanceAccess } from '../access/service.js';
import { normalizeTypeId } from '~/server/runtime/entities.js';
import { CLASS_COLLECTIONS } from '#packages/cts';

export function createTransitionAuth(userId, userRoleOrAuth, userPermissions = {}) {
  if (userRoleOrAuth && typeof userRoleOrAuth === 'object') {
    return {
      ...userRoleOrAuth,
      userId: userRoleOrAuth.userId || userId,
      memberships: userRoleOrAuth.memberships || userPermissions?.memberships || [],
      effectivePermissions: userRoleOrAuth.effectivePermissions || userPermissions?.effectivePermissions || null,
      permissions: userRoleOrAuth.permissions || userPermissions?.permissions || {}
    };
  }

  const system = userRoleOrAuth === 'SYSTEM' || userPermissions?.system === true || (!userId && !userRoleOrAuth);
  return {
    userId,
    system,
    role: system ? 'SYSTEM' : userRoleOrAuth || userPermissions?.role || null,
    organizationId: userPermissions?.organizationId,
    memberships: userPermissions?.memberships || [],
    effectivePermissions: userPermissions?.effectivePermissions || null,
    permissions: userPermissions?.permissions || {}
  };
}

export function normalizeTransitionContext(input = {}) {
  const invocation = {
    intent: input?.intent || null,
    source: input?.source ?? null
  };
  if (input && typeof input === 'object' && ('metadata' in input || 'lifecycle' in input)) {
    return {
      metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
      lifecycle: normalizeStatusLifecycle(input.lifecycle),
      ...invocation,
      producerOutputId: input.producerOutputId || null,
      region: input.region || input.machineRegion || input.machine,
      path: Array.isArray(input.path) ? input.path : null
    };
  }

  const { intent: _invokedIntent, source: _declaredSource, ...metadata } = input && typeof input === 'object' ? input : {};
  return {
    metadata,
    lifecycle: normalizeStatusLifecycle(),
    ...invocation,
    producerOutputId: input?.producerOutputId || null,
    region: input?.region || input?.machineRegion || input?.machine,
    path: Array.isArray(input?.path) ? input.path : null
  };
}

export function normalizeTransitionScope(context = {}) {
  return {
    region: context?.region || context?.metadata?.region || context?.machineRegion || context?.machine || null,
    path: Array.isArray(context?.path) ? context.path : null
  };
}

export function normalizeAuthContext(userId, userRole, metadata = {}) {
  if (userRole && typeof userRole === 'object') return createTransitionAuth(userId, userRole, metadata);
  if (metadata.auth && typeof metadata.auth === 'object') return createTransitionAuth(userId, metadata.auth, metadata);
  return createTransitionAuth(userId, userRole, metadata);
}

export async function prepareStatusEvidence({ db, entity, typeId, auth, eventId, lifecycle = {}, schema = null }) {
  const normalized = normalizeStatusLifecycle(lifecycle);
  if (!schema) return { lifecycle: normalized, entityAttachmentSet: {} };

  const attachments = normalizeLifecycleAttachmentRefs({
    lifecycleAttachments: normalized.attachments,
    schemaAttachments: schema.attachments || {},
    eventId
  });
  const snapshots = await captureLifecycleSnapshots({
    db,
    entity,
    typeId,
    auth,
    snapshotSchema: schema.snapshots || {}
  });
  const data = {
    ...normalized.data,
    ...(Object.keys(snapshots).length
      ? { snapshots: { ...(normalized.data.snapshots || {}), ...snapshots } }
      : {})
  };

  return {
    lifecycle: {
      ...normalized,
      attachments: attachments.lifecycleAttachments,
      data
    },
    entityAttachmentSet: attachments.entityAttachmentSet
  };
}

export function validateStatusMetadataPayload(metadata = {}, lifecycleSchema = null) {
  const description = lifecycleSchema?.description;
  if (!description?.required) return;
  const note = metadata?.note || metadata?.description;
  if (!String(note || '').trim()) {
    throw createError({
      statusCode: 400,
      message: 'Status description is required for this transition'
    });
  }
}

function normalizeLifecycleAttachmentRefs({ lifecycleAttachments = {}, schemaAttachments = {}, eventId }) {
  const entityAttachmentSet = {};
  const nextAttachments = {};

  for (const [slot, value] of Object.entries(lifecycleAttachments || {})) {
    const slotSchema = schemaAttachments[slot] || {};
    if (Array.isArray(value)) {
      nextAttachments[slot] = value.map((item, index) => normalizeLifecycleAttachmentRef({
        slot,
        slotSchema,
        item,
        eventId,
        index,
        entityAttachmentSet
      })).filter(Boolean);
      continue;
    }

    const normalized = normalizeLifecycleAttachmentRef({
      slot,
      slotSchema,
      item: value,
      eventId,
      index: null,
      entityAttachmentSet
    });
    if (normalized) nextAttachments[slot] = normalized;
  }

  return { lifecycleAttachments: nextAttachments, entityAttachmentSet };
}

function normalizeLifecycleAttachmentRef({ slot, slotSchema = {}, item = {}, eventId, index = null, entityAttachmentSet }) {
  if (!item || typeof item !== 'object') return null;
  const fileId = item.fileId || item.id;
  if (!fileId) return item;
  const attachmentKey = item.attachmentKey || ['status', slot, eventId?.toString(), index]
    .filter(value => value !== null && value !== undefined)
    .map(mongoSafeAttachmentKeyPart)
    .join('_');
  const bucketName = item.bucketName || item.bucket || 'uploads';
  const name = item.name || item.filename || '';
  const kind = item.kind || slotSchema.kind || slot;
  entityAttachmentSet[`attachments.${attachmentKey}`] = {
    kind,
    fileId: toFlexibleId(fileId),
    name,
    metadata: {
      ...(item.metadata || {}),
      bucketName,
      statusEventId: eventId?.toString(),
      slot
    },
    timestamp: new Date(),
    bucketName,
    url: item.url || `/api/files/download/${fileId}?bucket=${bucketName}`
  };

  return {
    attachmentKey,
    fileId: fileId?.toString?.() || fileId,
    bucketName,
    kind,
    name,
    url: item.url || `/api/files/download/${fileId}?bucket=${bucketName}`
  };
}

function mongoSafeAttachmentKeyPart(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]+/g, '_');
}

async function captureLifecycleSnapshots({ db, entity, typeId, auth, snapshotSchema = {} }) {
  const snapshots = {};
  for (const [key, definition] of Object.entries(snapshotSchema || {})) {
    if (!definition?.typeId) continue;
    const targetTypeId = normalizeTypeId(definition.typeId);
    const lineageKey = definition.lineageKey || `${typeId}Id`;
    const instanceId = entity?._id || entity?.identity?.uid;
    const candidates = [instanceId, instanceId?.toString?.()].filter(Boolean);
    const filter = {
      type: targetTypeId,
      [`lineage.${lineageKey}`]: candidates.length > 1 ? { $in: candidates } : candidates[0]
    };
    const limit = Math.max(1, Math.min(Number(definition.limit || 50), 100));
    // Snapshot targets are §3 instances: the target type's class
    // collection holds them, discriminated by type id, and the class
    // collection name is the access feature grants compile against.
    const docs = [];
    for (const [collectionName, feature] of Object.values(CLASS_COLLECTIONS).map(name => [name, name])) {
      const found = await db.collection(collectionName).find(filter).limit(limit).toArray();
      for (const doc of found) docs.push({ doc, feature });
    }
    const readable = docs
      .filter(({ doc, feature }) => hasInstanceAccess({
        entity: doc,
        feature,
        level: 'read',
        auth,
        typeId: targetTypeId
      }))
      .map(({ doc }) => doc);
    snapshots[key] = {
      capturedAt: new Date(),
      typeId: targetTypeId,
      lineageKey,
      count: readable.length,
      refs: readable.map(snapshotEntityRef)
    };
  }
  return snapshots;
}

function snapshotEntityRef(entity = {}) {
  return {
    id: entity._id?.toString?.() || entity._id || entity.identity?.uid || '',
    label: entity.identity?.name || entity.identity?.slug || entity.identity?.uid || entity._id?.toString?.() || '',
    status: getPrimaryState(entity.states ?? entity.status ?? entity.state, null)
  };
}

export function mergeLifecycle(current = {}, next = {}) {
  const currentLifecycle = normalizeStatusLifecycle(current);
  const nextLifecycle = normalizeStatusLifecycle(next);

  return {
    actors: nextLifecycle.actors.length > 0 ? nextLifecycle.actors : currentLifecycle.actors,
    attachments: {
      ...currentLifecycle.attachments,
      ...nextLifecycle.attachments
    },
    data: {
      ...currentLifecycle.data,
      ...nextLifecycle.data
    }
  };
}

