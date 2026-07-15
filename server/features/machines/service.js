import { createError } from 'h3';
import { createData, createIdentity, createStatus, Lineage } from '../../core/blocks/index.js';
import { markPublicSystemData } from '#shared/public-entities.js';
import { getLineageFilter, hasLineagePermission } from '../../utils/permissions.js';
import * as repository from './repository.js';
import { Machine } from './model.js';
import { ObjectId } from 'mongodb';

const DEFAULT_MACHINE_UID = 'machine-system-default';

const toDTO = raw => raw ? new Machine(raw).toJSON() : null;

export async function create(data = {}, userId, userOrg, userRole, userPermissions = {}) {
  const organizationId = data.organizationId || userOrg;
  const lineage = organizationId ? new Lineage().add('organization', organizationId) : {};
  if (!organizationId || !hasLineagePermission(userPermissions, lineage, 'machines', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied for machines' });
  }
  return createRecord(data, userId, lineage);
}

export async function ensureSystemDefault() {
  const existing = await repository.findById(DEFAULT_MACHINE_UID);
  if (existing) return toDTO(existing);
  return createRecord({
    _id: DEFAULT_MACHINE_UID,
    name: 'System CNC 3000 x 1500',
    workArea: { width: 3000, length: 1500 },
    boundaryOffset: { top: 10, right: 10, bottom: 10, left: 10 },
    default: true
  }, 'SYSTEM', { scope: 'system', public: true }, true);
}

async function createRecord(data, userId, lineage, system = false) {
  const uid = data._id?.toString?.() || data._id || new ObjectId().toString();
  const origin = createStatus('ACTIVE', userId || 'SYSTEM', { note: 'Machine created' });
  const raw = {
    _id: uid,
    identity: createIdentity(data.name || 'CNC machine', data.slug || '', '', '', uid),
    origin,
    status: origin,
    lineage,
    data: createData({
      workArea: normalizeDimensions(data.workArea),
      boundaryOffset: normalizeOffsets(data.boundaryOffset),
      default: Boolean(data.default)
    })
  };
  return toDTO(await repository.create(system ? markPublicSystemData(raw) : raw));
}

export async function getById(id, userId, userOrg, userRole, userPermissions = {}) {
  const machine = toDTO(await repository.findById(id));
  if (!machine) throw createError({ statusCode: 404, message: 'Machine not found' });
  if (!machine.data?.visibility?.public && !hasLineagePermission(userPermissions, machine, 'machines', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied for machines' });
  }
  return machine;
}

export async function list(userId, userOrg, userRole, userPermissions = {}) {
  await ensureSystemDefault();
  const filter = getLineageFilter(userPermissions);
  const organizationIds = filter['lineage.organization.entityId']?.$in || [];
  const raws = await repository.find({
    $or: [
      { 'lineage.scope': 'system' },
      ...(organizationIds.length ? [{ 'lineage.organization.entityId': { $in: organizationIds } }] : [])
    ]
  });
  return raws.map(toDTO).filter(machine => machine.data?.visibility?.public || hasLineagePermission(userPermissions, machine, 'machines', 'read'));
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions = {}) {
  const current = await getById(id, userId, userOrg, userRole, userPermissions);
  if (current.lineage?.scope === 'system') throw createError({ statusCode: 403, message: 'System machines are immutable' });
  if (!hasLineagePermission(userPermissions, current, 'machines', 'write')) throw createError({ statusCode: 403, message: 'Permission denied for machines' });
  const machine = new Machine(current);
  if (updates.name) machine.identity.name = updates.name;
  const { workArea, boundaryOffset, ...dataUpdates } = updates.data || {};
  machine.data = {
    ...machine.data,
    ...dataUpdates,
    ...((updates.workArea || workArea) ? { workArea: normalizeDimensions(updates.workArea || workArea) } : {}),
    ...((updates.boundaryOffset || boundaryOffset) ? { boundaryOffset: normalizeOffsets(updates.boundaryOffset || boundaryOffset) } : {})
  };
  return toDTO(await repository.updateById(id, machine.toJSON()));
}

function normalizeDimensions(value = {}) {
  return { width: Math.max(Number(value.width) || 3000, 1), length: Math.max(Number(value.length) || 1500, 1) };
}

function normalizeOffsets(value = {}) {
  return Object.fromEntries(['top', 'right', 'bottom', 'left'].map(key => [key, Math.max(Number(value[key]) || 0, 0)]));
}
