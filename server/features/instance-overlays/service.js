import { createError } from 'h3';
import { toFlexibleId } from '~/server/utils/objectid.js';
import { hasInstanceAccess } from '../../core/access/service.js';
import { declarationForType, writeGrantTarget } from '../instances/service.js';
import { getAppRegistry } from '../../runtime/app-registry.js';
import * as repository from './repository.js';

const BLOCK_KINDS = new Set(['text', 'view']);

export async function getOverlay(typeId, instanceId, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  const row = await repository.findByKey(organizationId, typeId, instanceId);
  return row ? repository.serialize(row) : null;
}

// The whole document in one write (SPEC §26): the client authors the
// overlay as a document — blocks plus the section order — and every save
// replaces the stored shape. No granular block operations exist.
export async function upsert(typeId, instanceId, { blocks, order } = {}, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  const { entity, declaration } = await requireOwnInstance(typeId, instanceId, auth);
  await requireWriteGrant(declaration, entity, organizationId, auth, 'update');
  const normalizedBlocks = normalizeBlocks(blocks);
  const normalizedOrder = normalizeOrder(order);
  const row = await repository.upsert({
    organizationId: toFlexibleId(organizationId),
    typeId: String(typeId),
    instanceId: toFlexibleId(instanceId),
    blocks: normalizedBlocks,
    order: normalizedOrder,
    updatedBy: auth.userId || null
  });
  return repository.serialize(row);
}

export async function remove(typeId, instanceId, auth = {}) {
  const organizationId = resolveOrganizationId(auth);
  const { entity, declaration } = await requireOwnInstance(typeId, instanceId, auth);
  await requireWriteGrant(declaration, entity, organizationId, auth, 'delete');
  const row = await repository.findByKey(organizationId, typeId, instanceId);
  if (!row) {
    throw createError({ statusCode: 404, message: 'Overlay not found' });
  }
  await repository.remove(organizationId, typeId, instanceId);
  return { success: true };
}

function resolveOrganizationId(auth = {}) {
  const organizationId = auth.organizationId;
  if (!organizationId) {
    throw createError({ statusCode: 403, message: 'Organization membership is required' });
  }
  return organizationId;
}

// The record itself, through the generic instance service (SPEC §13):
// the overlay is presentation data over a record that must exist in the
// caller's organization — a foreign or missing record answers 404 before
// any grant evaluation.
async function requireOwnInstance(typeId, instanceId, auth) {
  const organizationId = resolveOrganizationId(auth);
  const declaration = await declarationForType(typeId, organizationId).catch(() => null);
  if (!declaration) {
    throw createError({ statusCode: 404, message: `Unknown type ${typeId}` });
  }
  const service = getAppRegistry().getInstanceService(typeId);
  const entity = service?.processGetById
    ? await service.processGetById(instanceId, auth)
    : null;
  if (!entity) {
    throw createError({ statusCode: 404, message: `${typeId} ${instanceId} not found` });
  }
  const orgId = (entity.organizationId ?? entity.lineage?.organizationId)?.toString();
  if (!orgId || orgId !== String(organizationId)) {
    throw createError({ statusCode: 404, message: `${typeId} ${instanceId} not found` });
  }
  return { entity, declaration };
}

// The write gate is the record's own (the file-surfaces seam's law): the
// feature resolves through the declaration (`access.inherits`, else the
// class collection) and the shared evaluator decides against the loaded
// instance — fail-closed, exactly like the instance patch transport.
async function requireWriteGrant(declaration, entity, organizationId, auth, action = 'update') {
  const target = await writeGrantTarget(declaration, organizationId);
  if (!target || !hasInstanceAccess({ entity, typeId: target.typeId, feature: target.feature, level: 'write', action, auth })) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
}

function normalizeBlocks(blocks) {
  if (!Array.isArray(blocks)) {
    throw createError({ statusCode: 400, message: 'Overlay blocks must be a list' });
  }
  const ids = new Set();
  return blocks.map(block => {
    const id = String(block?.id || '').trim();
    const kind = String(block?.kind || '');
    if (!id || !BLOCK_KINDS.has(kind) || ids.has(id)) {
      throw createError({ statusCode: 400, message: 'Overlay blocks carry a unique id and a known kind' });
    }
    ids.add(id);
    if (kind === 'text') {
      return { id, kind, text: String(block.text ?? '') };
    }
    const view = block.view && typeof block.view === 'object' ? block.view : null;
    if (!view?.id) {
      throw createError({ statusCode: 400, message: 'A view block carries its view reference' });
    }
    return { id, kind, view: { id: String(view.id), name: String(view.name || '') } };
  });
}

function normalizeOrder(order) {
  if (!Array.isArray(order) || order.some(key => typeof key !== 'string' || !key)) {
    throw createError({ statusCode: 400, message: 'Overlay order must be a list of section keys' });
  }
  return order.map(String);
}
