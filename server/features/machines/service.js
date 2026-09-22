import { createError } from 'h3';
import { ObjectId } from 'mongodb';
import { createData, createIdentity } from '../../core/blocks/index.js';
import { assertEntityAccess, hasInstanceAccess } from '../../core/access/service.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { markPublicSystemData } from '#shared/public-entities.js';
import { Machine } from './model.js';
import * as repository from './repository.js';
import { createProcessUpdateHandler } from '../_template/process-update-handler.js';

export const SYSTEM_DEFAULT_MACHINE_ID = 'machine-system-default';

function toDTO(raw) {
  return raw ? new Machine(raw).toJSON() : null;
}

function validateMachineData(data = {}) {
  const width = Number(data.workingArea?.width ?? data.width);
  const length = Number(data.workingArea?.length ?? data.length);
  const boundaryOffset = Number(data.boundaryOffset ?? 0);
  if (!Number.isFinite(width) || width <= 0) throw createError({ statusCode: 400, message: 'Machine working width must be positive' });
  if (!Number.isFinite(length) || length <= 0) throw createError({ statusCode: 400, message: 'Machine working length must be positive' });
  if (!Number.isFinite(boundaryOffset) || boundaryOffset < 0) throw createError({ statusCode: 400, message: 'Machine boundary offset cannot be negative' });
  if (boundaryOffset * 2 >= Math.min(width, length)) {
    throw createError({ statusCode: 400, message: 'Machine boundary offset leaves no usable working area' });
  }
  return { workingArea: { width, length }, boundaryOffset, description: data.description || '' };
}

function systemDefaultDocument() {
  return markPublicSystemData({
    _id: SYSTEM_DEFAULT_MACHINE_ID,
    identity: createIdentity('Default 3000 × 1500 machine', SYSTEM_DEFAULT_MACHINE_ID),
    lineage: {},
    data: createData({
      systemKey: 'default-nesting-machine',
      workingArea: { width: 3000, length: 1500 },
      boundaryOffset: 0,
      description: 'System default nesting working area'
    })
  });
}

export async function seedSystemDefault() {
  return toDTO(await repository.upsertSystemDefault(systemDefaultDocument()));
}

export async function getById(id, userId = null, userOrg = null, userRole = null, auth = null) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Machine not found' });
  if (!hasInstanceAccess({ entity: raw, typeId: 'machine', feature: 'machines', level: 'read', auth })) {
    throw createError({ statusCode: auth ? 403 : 401, message: auth ? 'Permission denied' : 'Authentication required' });
  }
  return toDTO(raw);
}

export async function list(userId = null, userOrg = null, userRole = null, auth = null) {
  await seedSystemDefault();
  const organizationIds = (auth?.memberships || [])
    .map(membership => membership.organizationId)
    .filter(Boolean)
    .flatMap(id => [toFlexibleId(id), id.toString()]);
  const raws = await repository.find({
    $or: [
      { 'lineage.scope': 'system' },
      { 'lineage.organizationId': { $in: organizationIds } }
    ]
  });
  return raws
    .filter(raw => hasInstanceAccess({ entity: raw, typeId: 'machine', feature: 'machines', level: 'read', auth }))
    .map(toDTO);
}

export async function create(data, userId, userOrg, userRole, auth) {
  if (!userOrg) throw createError({ statusCode: 400, message: 'Organization context required' });
  const lineage = { organizationId: toFlexibleId(userOrg) };
  assertEntityAccess({ entity: { lineage }, typeId: 'machine', feature: 'machines', level: 'write', auth });
  const machine = new Machine({
    identity: createIdentity(data.name || 'Machine', `machine-${new ObjectId().toString().slice(-12)}`),
    lineage,
    data: validateMachineData(data.data || data)
  });
  return toDTO(await repository.create(machine.toJSON()));
}

export async function update(id, updates, userId, userOrg, userRole, auth) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Machine not found' });
  if (raw.lineage?.scope === 'system') throw createError({ statusCode: 403, message: 'System machines cannot be modified' });
  assertEntityAccess({ entity: raw, typeId: 'machine', feature: 'machines', level: 'write', auth });
  const data = validateMachineData({ ...raw.data, ...(updates.data || updates) });
  const identity = { ...raw.identity, ...(updates.name ? { name: updates.name } : {}) };
  return toDTO(await repository.updateById(id, { identity, data }));
}

export async function remove(id, userId, userOrg, userRole, auth) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Machine not found' });
  if (raw.lineage?.scope === 'system') throw createError({ statusCode: 403, message: 'System machines cannot be deleted' });
  assertEntityAccess({ entity: raw, typeId: 'machine', feature: 'machines', level: 'admin', auth });
  await repository.deleteById(id);
  return { success: true };
}

export const processUpdate = createProcessUpdateHandler({
  typeId: 'machine',
  repository,
  Model: Machine
});
