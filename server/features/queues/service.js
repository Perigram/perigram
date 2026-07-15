import * as repository from './repository.js';
import * as projectsService from '../projects/service.js';
import * as entityRevisionsService from '../entity-revisions/service.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '../../utils/permissions.js';
import { getPrimaryState, inheritLineage, Lineage } from '~/server/core/blocks/index.js';
import { Queue } from './model.js';
import { createTransitionAuth, statusService } from '../../core/machines/service.js';
import { aggregator } from '../../core/machines/aggregator.js';
import { generateRandomString } from '../../utils/strings.js';
import { serializeForAccess, serializeManyForAccess } from '../../utils/entity-redaction.js';
import { mapLineageQuery } from '../../utils/query.js';

/**
 * Queues Service - v24 Absolute Final
 */

const DEFAULT_NESTING_SETTINGS = Object.freeze({
  materialMode: 'VIRTUAL',
  virtualWidth: 3000,
  virtualLength: 1500,
  spacing: 5,
  warehouseId: null,
  inventoryItems: [],
  machineId: null,
  materialId: null,
  sheetThickness: 4,
  toolProfileId: null,
  requestedArtifacts: []
});

export function normalizeQueueNestingSettings(input = {}, previous = {}) {
  const merged = {
    ...DEFAULT_NESTING_SETTINGS,
    ...(previous || {}),
    ...(input || {})
  };
  const materialMode = ['WAREHOUSE', 'INVENTORY'].includes(merged.materialMode) ? 'WAREHOUSE' : 'VIRTUAL';
  const inventoryItems = Array.from(new Set(
    (Array.isArray(merged.inventoryItems) ? merged.inventoryItems : [])
      .map(item => item?.toString?.() || item)
      .filter(Boolean)
  ));
  const requestedArtifacts = Array.from(new Set(
    (Array.isArray(merged.requestedArtifacts) ? merged.requestedArtifacts : [])
      .map(item => item?.toString?.() || item)
      .filter(Boolean)
  ));

  return {
    materialMode,
    virtualWidth: positiveNumber(merged.virtualWidth ?? merged.width, DEFAULT_NESTING_SETTINGS.virtualWidth),
    virtualLength: positiveNumber(merged.virtualLength ?? merged.height, DEFAULT_NESTING_SETTINGS.virtualLength),
    spacing: nonNegativeNumber(merged.spacing ?? merged.space, DEFAULT_NESTING_SETTINGS.spacing),
    warehouseId: merged.warehouseId?.toString?.() || merged.warehouseId || null,
    inventoryItems,
    machineId: merged.machineId?.toString?.() || merged.machineId || null,
    materialId: merged.materialId?.toString?.() || merged.materialId || null,
    sheetThickness: nonNegativeNumber(merged.sheetThickness, DEFAULT_NESTING_SETTINGS.sheetThickness),
    toolProfileId: merged.toolProfileId?.toString?.() || merged.toolId?.toString?.() || merged.toolProfileId || merged.toolId || null,
    requestedArtifacts
  };
}

export function getQueueNestingSettings(queue = {}) {
  return normalizeQueueNestingSettings(queue.data?.nestingSettings || {});
}

export function buildNestingCommandParameters(queue = {}, overrides = {}) {
  const settings = normalizeQueueNestingSettings(overrides.nestingSettings || {}, getQueueNestingSettings(queue));
  const materialPool = Array.isArray(overrides.materialPool) && overrides.materialPool.length
    ? overrides.materialPool
    : queue.data?.job?.materialPool || [];

  return {
    materialMode: settings.materialMode,
    virtualWidth: settings.virtualWidth,
    virtualLength: settings.virtualLength,
    spacing: settings.spacing,
    inventoryItems: settings.inventoryItems,
    materialPool,
    machineId: settings.machineId,
    materialId: settings.materialId,
    sheetThickness: settings.sheetThickness,
    toolProfileId: settings.toolProfileId
  };
}

export function normalizeQueueJob(job = {}) {
  const source = job && typeof job === 'object' ? job : {};
  return {
    ...source,
    items: normalizeQueueJobItems(source.items || []),
    materialPool: Array.isArray(source.materialPool) ? source.materialPool : []
  };
}

export function normalizeQueueJobItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(normalizeQueueJobItem)
    .filter(item => item.id && item.entityType);
}

function normalizeQueueJobItem(item = {}) {
  const id = item.id || '';
  const entityType = item.entityType || '';
  return {
    ...item,
    id,
    entityType,
    quantity: Number(item.quantity || item.count || 1),
    parameters: item.parameters || item.dimensions || {}
  };
}


export async function create(data, userId, userOrg, userRole, userPermissions) {
  const { projectId, name, job } = data;
  const lineage = projectId
    ? inheritLineage(await requireProject(projectId), 'project')
    : new Lineage().add('organization', userOrg);

  if (!hasLineagePermission(userPermissions, lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const queueNumber = await repository.getNextQueueNumber({ projectId, organizationId: userOrg });
  const uid = `q-${generateRandomString(8)}`;
  const initialStatus = await statusService.initialStatusForOrganization(
    'queue',
    userOrg,
    userId,
    { note: 'Initial queue creation' }
  );

  const queue = new Queue({
    identity: { uid, name: name || `Queue #${queueNumber}` },
    lineage,
    data: {
      job: normalizeQueueJob(job || { items: [], materialPool: [] }),
      nestingSettings: normalizeQueueNestingSettings(data.nestingSettings || {}),
      queueNumber
    },
    origin: initialStatus,
    status: initialStatus
  });

  const createdRaw = await repository.create(queue);

  if (lineage.project?.entityId) {
    aggregator.syncParentSummary('queue', lineage).catch(err => {
      console.error('[Queues Service] Failed to sync parent summary:', err.message);
    });
  }

  return serializeForAccess('queue', new Queue(createdRaw), userPermissions);
}

async function requireProject(projectId) {
  const project = await projectsService.getById(projectId);
  if (!project) throw createError({ statusCode: 404, message: 'Project not found' });
  return project;
}

export async function getById(uid, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(uid);
  if (!raw) return null;
  const queue = new Queue(raw);
  if (userPermissions?.memberships && !hasLineagePermission(userPermissions, queue, 'queues', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  return serializeForAccess('queue', queue, userPermissions);
}

export async function list(filters = {}, userId, userOrg, userRole, userPermissions) {
  const filter = {
    ...mapLineageQuery(filters),
    ...getLineageFilter(userPermissions)
  };
  delete filter.status;
  delete filter.primaryStatus;
  delete filter.primaryStatuses;
  const primaryStatuses = normalizePrimaryStatuses(filters.primaryStatuses);
  if (primaryStatuses.length) filter['status.state.primary'] = { $in: primaryStatuses };
  else if (filters.status || filters.primaryStatus) filter['status.state.primary'] = filters.status || filters.primaryStatus;

  const raws = await repository.find(filter);
  const queues = raws.map(raw => new Queue(raw))
    .filter(queue => hasLineagePermission(userPermissions, queue, 'queues', 'read'));
  return serializeManyForAccess('queue', queues, userPermissions);
}

function normalizePrimaryStatuses(value) {
  if (Array.isArray(value)) return value.flatMap(normalizePrimaryStatuses);
  if (typeof value !== 'string') return [];
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

export async function listByProject(projectId, userId, userOrg, userRole, userPermissions) {
  const filter = {
    ...getLineageFilter(userPermissions),
    'lineage.project.entityId': String(projectId)
  };
  const raws = await repository.find(filter);
  const queues = raws.map(raw => new Queue(raw))
    .filter(queue => hasLineagePermission(userPermissions, queue, 'queues', 'read'));
  return serializeManyForAccess('queue', queues, userPermissions);
}

export async function listPreviewByProjects(projectIds = [], userId, userOrg, userRole, userPermissions, options = {}) {
  const projectIdValues = Array.from(new Set(projectIds
    .flatMap(projectId => flexibleLookupValues(projectId))
    .filter(Boolean)));
  if (!projectIdValues.length) return {};

  const filter = {
    ...getLineageFilter(userPermissions),
    'lineage.project.entityId': { $in: projectIdValues }
  };
  const limit = Math.max(Number(options.limit || 5), 1);
  const raws = await repository.find(filter);
  const queues = serializeManyForAccess('queue', raws.map(raw => new Queue(raw)), userPermissions)
    .sort((left, right) => Number(right.data?.queueNumber || 0) - Number(left.data?.queueNumber || 0));
  const previews = {};

  for (const queue of queues) {
    const projectId = queue.lineage?.project?.entityId?.toString?.() || queue.lineage?.project?.entityId;
    if (!projectId) continue;
    previews[projectId] = previews[projectId] || [];
    if (previews[projectId].length >= limit) continue;
    previews[projectId].push(queuePreview(queue));
  }

  return previews;
}

export async function update(uid, updates, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'Queue not found' });
  const queue = new Queue(raw);

  if (!hasLineagePermission(userPermissions, queue, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (updates.status) {
    await statusService.transition('queue', queue._id, updates.status, userId, createTransitionAuth(userId, userRole, userPermissions), updates.statusMeta || {});
    return await getById(uid, userId, userOrg, userRole, userPermissions);
  }

  const dataUpdates = { ...(updates.data || {}) };
  const nestingSettingsUpdate = updates.nestingSettings || dataUpdates.nestingSettings;
  delete dataUpdates.nestingSettings;

  // Update data block
  queue.data = { ...queue.data, ...dataUpdates };
  
  // Handle root level updates that should go to job/params
  if (updates.job) queue.data.job = normalizeQueueJob(updates.job);
  if (nestingSettingsUpdate) {
    queue.data.nestingSettings = normalizeQueueNestingSettings(nestingSettingsUpdate, queue.data.nestingSettings);
  }

  await repository.updateById(uid, queue);
  const updatedRaw = await repository.findById(uid);
  return serializeForAccess('queue', new Queue(updatedRaw), userPermissions);
}

export async function appendGeneratedCassetteDesignOutputs(uid, references = [], auth = {}) {
  const raw = await repository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'Queue not found' });
  const queue = new Queue(raw);
  if (!hasLineagePermission(auth, queue, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const job = normalizeQueueJob(queue.data?.job || {});
  const existingIds = new Set(job.items
    .filter(item => item.entityType === 'cassette_design')
    .map(item => String(item.id)));
  const additions = references.flatMap((reference, index) => {
    const id = reference?.id?.toString?.() || reference?.id;
    if (!id || reference?.entityType !== 'cassette_design' || existingIds.has(String(id))) return [];
    existingIds.add(String(id));
    return [{
      entryId: `action_${id}_${index}`,
      id,
      entityType: 'cassette_design',
      type: 'STATIC',
      quantity: 1,
      parameters: {}
    }];
  });
  if (!additions.length) return serializeForAccess('queue', queue, auth);

  queue.data = {
    ...(queue.data || {}),
    job: {
      ...job,
      items: [...job.items, ...additions]
    }
  };
  const updated = await repository.updateById(uid, queue);
  return serializeForAccess('queue', new Queue(updated), auth);
}

export async function selectNestingRevision(uid, revisionId, auth = {}) {
  const raw = await repository.findById(uid);
  if (!raw) throw createError({ statusCode: 404, message: 'Queue not found' });
  const queue = new Queue(raw);
  if (!hasLineagePermission(auth, queue, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  const revision = await entityRevisionsService.getById(revisionId, auth.userId, auth.role, auth);
  if (
    revision.data?.entityType !== 'queue'
    || String(revision.data?.entityId) !== String(uid)
    || revision.data?.scope !== 'nesting'
    || revision.data?.outcome !== 'SUCCESS'
  ) {
    throw createError({ statusCode: 400, message: 'Only a successful nesting revision of this queue can be selected' });
  }

  await statusService.applyIntent(
    'queue',
    uid,
    'selectNestingRevision',
    createTransitionAuth(auth.userId, auth),
    { note: 'Nesting revision selected' },
    {
      region: 'nesting',
      lifecycle: { data: { selectedRevisionId: revision._id?.toString?.() || revision._id } }
    }
  );
  return {
    queue: await getById(uid, auth.userId, auth.organizationId, auth.role, auth),
    revision
  };
}

export async function remove(uid, userId, userOrg, userRole, userPermissions) {
  const queue = await repository.findById(uid);
  if (!queue) throw createError({ statusCode: 404, message: 'Queue not found' });

  if (!hasLineagePermission(userPermissions, queue, 'queues', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  return await repository.deleteById(uid);
}

function flexibleLookupValues(id) {
  if (id === null || id === undefined) return [];
  return [String(id)];
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonNegativeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function queuePreview(queue = {}) {
  const items = queue.data?.job?.items || [];
  const materialPool = queue.data?.job?.materialPool || [];
  const preview = {
    _id: queue._id?.toString?.() || queue._id,
    entityType: 'queue',
    identity: {
      ...(queue.identity || {}),
      name: queue.identity?.name || queue.identity?.slug || queue.identity?.uid || 'Queue'
    },
    origin: queue.origin || null,
    status: queue.status || null,
    lineage: queue.lineage || {},
    data: {
      queueNumber: queue.data?.queueNumber || null
    },
    summary: {
      jobItemCount: items.length,
      totalQuantity: items.reduce((sum, item) => sum + Number(item.quantity || item.count || 1), 0),
      revisionCount: Number(queue.summary?.revisionCount || 0),
      materialSourceCount: materialPool.length,
      materialSheetCount: materialPool.reduce((sum, item) => sum + Number(item.available || item.availableCount || item.quantity || item.count || 1), 0)
    }
  };
  return {
    ...preview,
    name: preview.identity.name,
    queueNumber: preview.data.queueNumber,
    state: getPrimaryState(queue.status, 'DRAFT'),
    jobItemCount: preview.summary.jobItemCount,
    totalQuantity: preview.summary.totalQuantity,
    revisionCount: preview.summary.revisionCount,
    materialSourceCount: preview.summary.materialSourceCount,
    materialSheetCount: preview.summary.materialSheetCount
  };
}

export async function resetToDraft(queueId, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(queueId);
  if (!raw) throw createError({ statusCode: 404, message: 'Queue not found' });
  const queue = new Queue(raw);
  
  if (!hasLineagePermission(userPermissions, queue, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  await statusService.transition('queue', queueId, 'DRAFT', userId, createTransitionAuth(userId, userRole, userPermissions), { note: 'Reset to DRAFT' });
  
  return await getById(queueId);
}

export async function getArtifacts(queueId, userId, userOrg, userRole, userPermissions, revisionId) {
    const queue = await getById(queueId);
    if (!queue) throw createError({ statusCode: 404, message: 'Queue not found' });
    
    if (!hasLineagePermission(userPermissions, queue, 'queues', 'read')) {
        throw createError({ statusCode: 403, message: 'Permission denied' });
    }

    const { list: listArtifacts } = await import('../artifacts/service.js');
    const selectedRevisionId = revisionId || queue.status?.lifecycle?.data?.selectedRevisionId;
    if (!selectedRevisionId) return [];
    const filter = {
      'lineage.queue.entityId': String(queueId),
      'lineage.queue.revisionId': String(selectedRevisionId)
    };

    return await listArtifacts(filter, userPermissions);
}
