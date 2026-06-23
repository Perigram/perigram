import * as repository from './repository.js';
import * as projectsService from '../projects/service.js';
import * as materialPilesService from '../material-piles/service.js';
import * as remnantsService from '../remnants/service.js';
import * as cassetteInstancesService from '../cassette-instances/service.js';
import * as sheetDesignsService from '../sheet-designs/service.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '../../utils/permissions.js';
import { getPrimaryState, inheritLineage } from '~/server/core/blocks/index.js';
import { Queue } from './model.js';
import { createTransitionAuth, statusService } from '../../core/machines/service.js';
import { aggregator } from '../../core/machines/aggregator.js';
import { generateRandomString } from '../../utils/strings.js';
import { ObjectId } from 'mongodb';
import { toFlexibleId } from '../../utils/objectid.js';
import { serializeForAccess, serializeManyForAccess } from '../../utils/entity-redaction.js';

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
    toolProfileId: merged.toolProfileId?.toString?.() || merged.toolId?.toString?.() || merged.toolProfileId || merged.toolId || null,
    requestedArtifacts
  };
}

export function getQueueNestingSettings(queue = {}) {
  return normalizeQueueNestingSettings(queue.data?.nestingSettings || queue.data?.nestingParams || {});
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
    toolProfileId: settings.toolProfileId
  };
}


export async function create(data, userId, userOrg, userRole, userPermissions) {
  const { projectId, name, job } = data;
  
  if (!projectId) {
    throw createError({ statusCode: 400, message: 'Project ID is required' });
  }
  
  const project = await projectsService.getById(projectId);
  if (!project) throw createError({ statusCode: 404, message: 'Project not found' });

  const lineage = inheritLineage(project, 'project');

  if (!hasLineagePermission(userPermissions, lineage, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const queueNumber = await repository.getNextQueueNumber(projectId);
  const uid = `q-${generateRandomString(8)}`;

  const queue = new Queue({
    identity: { uid, name: name || `Queue #${queueNumber}` },
    lineage,
    data: {
      job: job || { items: [], materialPool: [] },
      nestingSettings: normalizeQueueNestingSettings(data.nestingSettings || data.nestingParams || {}),
      queueNumber
    }
  });

  queue.applyStatus('DRAFT', userId, { note: 'Initial queue creation' });

  const createdRaw = await repository.create(queue);

  // Trigger summary update on project
  aggregator.syncParentSummary('queue', lineage).catch(err => {
    console.error('[Queues Service] Failed to sync parent summary:', err.message);
  });

  return serializeForAccess('queue', new Queue(createdRaw), userPermissions);
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
    ...getLineageFilter(userPermissions)
  };
  if (filters.projectId) filter['lineage.projectId'] = toFlexibleId(filters.projectId);
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
    'lineage.projectId': toFlexibleId(projectId)
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
    'lineage.projectId': { $in: projectIdValues }
  };
  const limit = Math.max(Number(options.limit || 5), 1);
  const raws = await repository.find(filter);
  const queues = serializeManyForAccess('queue', raws.map(raw => new Queue(raw)), userPermissions)
    .sort((left, right) => Number(right.data?.queueNumber || 0) - Number(left.data?.queueNumber || 0));
  const previews = {};

  for (const queue of queues) {
    const projectId = queue.lineage?.projectId?.toString?.() || queue.lineage?.projectId;
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
  if (dataUpdates.nestingParams && !dataUpdates.nestingSettings) {
    dataUpdates.nestingSettings = dataUpdates.nestingParams;
  }
  delete dataUpdates.nestingParams;

  // Update data block
  queue.data = { ...queue.data, ...dataUpdates };
  
  // Handle root level updates that should go to job/params
  if (updates.job) queue.data.job = updates.job;
  const nestingSettingsUpdate = updates.nestingSettings || updates.nestingParams;
  if (nestingSettingsUpdate) {
    queue.data.nestingSettings = normalizeQueueNestingSettings(nestingSettingsUpdate, queue.data.nestingSettings || queue.data.nestingParams);
  } else if (!queue.data.nestingSettings && queue.data.nestingParams) {
    queue.data.nestingSettings = normalizeQueueNestingSettings(queue.data.nestingParams);
  }
  delete queue.data.nestingParams;

  await repository.updateById(uid, queue);
  const updatedRaw = await repository.findById(uid);
  return serializeForAccess('queue', new Queue(updatedRaw), userPermissions);
}

export async function remove(uid, userId, userOrg, userRole, userPermissions) {
  const queue = await repository.findById(uid);
  if (!queue) throw createError({ statusCode: 404, message: 'Queue not found' });
  
  if (!hasLineagePermission(userPermissions, queue, 'queues', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return await repository.deleteById(uid);
}

export async function preflightChosenRunProduction(queueId, chosenRun, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(queueId);
  if (!raw) throw createError({ statusCode: 404, message: 'Queue not found' });
  const queue = new Queue(raw);

  if (!hasLineagePermission(userPermissions, queue, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  const existingRunId = queue.data?.materialConsumption?.runId;
  if (existingRunId) {
    if (existingRunId === chosenRun._id?.toString()) return { alreadyProduced: true };
    throw createError({ statusCode: 400, message: 'Queue already has chosen production output' });
  }
  if (getPrimaryState(chosenRun?.status) !== 'COMPLETE') {
    throw createError({ statusCode: 400, message: 'Only completed nesting runs can be chosen for production' });
  }
  if (!['NESTING', 'READY'].includes(getPrimaryState(queue.status, 'DRAFT'))) {
    throw createError({ statusCode: 400, message: 'Queue must be awaiting a completed nesting run before choosing production run' });
  }

  await planMaterialConsumption(queue, chosenRun);
  return { alreadyProduced: false };
}

export async function ensureReadyForCompletedRun(queueId, chosenRun) {
  const raw = await repository.findById(queueId);
  if (!raw) throw createError({ statusCode: 404, message: 'Queue not found' });
  const queue = new Queue(raw);
  return queue.toJSON();
}

export async function applyChosenRunProduction(queueId, chosenRun, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(queueId);
  if (!raw) throw createError({ statusCode: 404, message: 'Queue not found' });
  const queue = new Queue(raw);

  if (!hasLineagePermission(userPermissions, queue, 'queues', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  const existingRunId = queue.data?.materialConsumption?.runId;
  if (existingRunId) {
    if (existingRunId === chosenRun._id?.toString()) return queue.toJSON();
    throw createError({ statusCode: 400, message: 'Queue already has chosen production output' });
  }

  const materialConsumption = await consumePileStockForCut(queue, chosenRun, userId, userRole);
  const physicalOutputs = await createPhysicalOutputsForCut(queue, chosenRun, materialConsumption, userId, userOrg, userRole, userPermissions);
  queue.data = {
    ...(queue.data || {}),
    materialConsumption,
    physicalOutputs
  };
  await repository.updateById(queueId, queue);
  if (getPrimaryState(queue.status, 'DRAFT') !== 'READY') {
    await statusService.applyIntent('queue', queueId, 'completeNestingProduction', createTransitionAuth('SYSTEM', 'SYSTEM'), {
      note: 'Production run chosen',
      runId: chosenRun._id?.toString?.() || chosenRun._id,
      chosenBy: userId
    });
  }

  return await getById(queueId);
}

function flexibleLookupValues(id) {
  if (id === null || id === undefined) return [];
  const stringId = id?.toString?.() || id;
  const flexibleId = toFlexibleId(id);
  return [flexibleId, stringId].filter((value, index, values) => (
    value !== null && value !== undefined && values.findIndex(item => item?.toString?.() === value?.toString?.()) === index
  ));
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
  return {
    _id: queue._id?.toString?.() || queue._id,
    name: queue.identity?.name || queue.identity?.slug || '',
    queueNumber: queue.data?.queueNumber || null,
    state: getPrimaryState(queue.status, 'DRAFT'),
    jobItemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + Number(item.quantity || item.count || 1), 0),
    runCount: Number(queue.summary?.runCount || 0),
    sheetCount: Number(queue.summary?.sheetCount || 0),
    totalArea: Number(queue.summary?.totalArea || 0),
    materialSourceCount: materialPool.length,
    materialSheetCount: materialPool.reduce((sum, item) => sum + Number(item.available || item.availableCount || item.quantity || item.count || 1), 0)
  };
}

async function consumePileStockForCut(queue, chosenRun, userId, userRole) {
  const planned = await planMaterialConsumption(queue, chosenRun);
  const consumed = [];
  for (const source of planned.sources) {
    await materialPilesService.allocate(source.id, source.count, userId, userRole, {
      queueId: queue._id?.toString(),
      runId: chosenRun._id?.toString()
    });
    consumed.push(source);
  }

  return {
    runId: chosenRun._id?.toString(),
    requiredSheets: planned.requiredSheets,
    consumedAt: new Date(),
    sources: consumed
  };
}

async function planMaterialConsumption(queue, chosenRun) {
  const requiredSheets = Number(chosenRun.data?.results?.sheetCount || chosenRun.summary?.sheetCount || chosenRun.layoutCount || 0);
  const materialPool = chosenRun.data?.materialPool?.length
    ? chosenRun.data.materialPool
    : queue.data?.job?.materialPool || [];
  if (!materialPool.length) {
    throw createError({ statusCode: 400, message: 'Material assignment is required before choosing production run' });
  }
  if (!requiredSheets) {
    throw createError({ statusCode: 400, message: 'Chosen nesting run has no sheet count' });
  }

  return {
    requiredSheets,
    ...(await planPileStockConsumption(materialPool, requiredSheets))
  };
}

async function planPileStockConsumption(materialPool, requiredSheets) {
  let remaining = requiredSheets;
  const sources = [];
  for (const source of materialPool) {
    if (remaining <= 0) break;
    if (String(source.type || '').toUpperCase() !== 'PILE') continue;
    const pile = await materialPilesService.getById(source.id);
    const stock = pile?.data?.stock || {};
    const available = Math.max(Number(stock.total || 0) - Number(stock.used || 0), 0);
    const count = Math.min(remaining, Math.max(Math.floor(available), 0));
    if (!count) continue;
    sources.push({
      ...source,
      type: 'PILE',
      id: source.id,
      count
    });
    remaining -= count;
  }

  if (remaining > 0) {
    throw createError({ statusCode: 400, message: `Insufficient selected pile stock. Missing ${remaining} sheets` });
  }

  return { sources, remaining };
}

async function createPhysicalOutputsForCut(queue, chosenRun, materialConsumption, userId, userOrg, userRole, userPermissions) {
  const runSheetDesigns = await sheetDesignsForRun(queue, chosenRun, userId, userOrg, userRole, userPermissions);
  const sheetIds = [];
  const sourceSheets = [];
  const remnantIds = [];
  const cassetteInstanceIds = [];
  let sheetIndex = 0;

  for (const source of materialConsumption.sources) {
    for (let index = 0; index < source.count; index += 1) {
      const sheetDesign = runSheetDesigns[sheetIndex] || null;
      const sheet = createCutSheetDescriptor(source.id, {
        queue,
        run: chosenRun,
        source,
        index: sheetIndex,
        sheetDesign
      });
      sourceSheets.push({
        id: sheet._id,
        materialSource: sheet.data?.materialSource,
        sheetDesignId: sheetDesign?._id?.toString?.() || sheetDesign?._id || null
      });

      const instances = await cassetteInstancesService.createFromCutSheet(
        sheet,
        cassetteInstanceDesignsForSheet(sheetDesign),
        userId
      );
      cassetteInstanceIds.push(...instances.map(instance => instance._id?.toString()).filter(Boolean));

      const remnantGeometry = remnantGeometryForSheetDesign(sheetDesign);
      if (remnantGeometry?.area > 0) {
        const remnant = await remnantsService.createFromCutSheet(sheet, {
          area: remnantGeometry.area,
          width: remnantGeometry.width,
          height: remnantGeometry.height,
          geometryData: remnantGeometry.geometryData,
          index: sheetIndex,
          userId
        });
        if (remnant?._id) remnantIds.push(remnant._id.toString());
      }
      sheetIndex += 1;
    }
  }

  return {
    runId: chosenRun._id?.toString(),
    sheetIds,
    sourceSheets,
    remnantIds,
    cassetteInstanceIds
  };
}

function createCutSheetDescriptor(pileId, { queue, run, source = {}, index = 0, sheetDesign = null } = {}) {
  const sourceDimensions = source.dimensions || source.specsData || {};
  const width = Number(sheetDesign?.specs?.width || sourceDimensions.width || source.width || 0);
  const length = Number(sheetDesign?.specs?.length || sourceDimensions.length || sourceDimensions.height || source.height || 0);
  const warehouseId = source.warehouseId || source.lineage?.warehouseId || source.materialSource?.warehouseId || null;
  const specs = {
    ...(source.specsData || {}),
    ...(sourceDimensions || {}),
    width,
    length,
    area: width && length ? (width * length) / 1000000 : undefined
  };
  const uid = `cut-source-${run?._id || 'run'}-${index + 1}`;
  return {
    _id: uid,
    identity: {
      uid,
      serial: `CUT-S${index + 1}`,
      name: `Cut source sheet ${index + 1}`
    },
    lineage: {
      ...(queue?.lineage || {}),
      pileId,
      warehouseId: warehouseId ? toFlexibleId(warehouseId) : null,
      queueId: queue?._id,
      runId: run?._id
    },
    specs,
    data: {
      virtualSource: true,
      source: 'QUEUE_CUT_SOURCE',
      specs,
      materialSource: {
        type: 'PILE',
        id: pileId,
        label: source.label || pileId
      },
      queueId: queue?._id?.toString?.() || queue?._id,
      runId: run?._id?.toString?.() || run?._id,
      sheetDesignId: sheetDesign?._id?.toString?.() || sheetDesign?._id || null
    }
  };
}

async function sheetDesignsForRun(queue, chosenRun, userId, userOrg, userRole, userPermissions) {
  const runId = chosenRun._id?.toString();
  return await sheetDesignsService.listForRunOutput(queue._id, runId, chosenRun.data?.sheetDesignIds || []);
}

function cassetteInstanceDesignsForSheet(sheetDesign = null) {
  return (sheetDesign?.data?.cassetteDesigns || []).map((item, index) => ({
    designId: item.cassetteDesignId,
    cassetteDesignId: item.cassetteDesignId,
    sheetDesignId: sheetDesign._id,
    count: Number(item.count || 1),
    reference: item.reference || '',
    serial: item.serial || `${sheetDesign.identity?.serial || sheetDesign._id}-${index + 1}`
  })).filter(item => item.designId);
}

function remnantGeometryForSheetDesign(sheetDesign = null) {
  const result = sheetDesign?.data?.geometry?.data;
  if (!result) return null;
  const width = Number(sheetDesign?.specs?.width || 0);
  const height = Number(sheetDesign?.specs?.length || 0);
  const outer = normalizePolygon(
    result.bins?.[0]?.shape?.data?.outer ||
    (width > 0 && height > 0 ? [[0, 0], [width, 0], [width, height], [0, height], [0, 0]] : [])
  );
  if (outer.length < 3) return null;

  const sourcePointsById = new Map((result.items || [])
    .map(item => [item.id?.toString(), normalizePolygon(item.shape?.data || item.coords || item.coordinates || [])])
    .filter(([id, points]) => id !== undefined && points.length >= 3));
  const layouts = result.solution?.layouts || result.layouts || [];
  const layout = layouts[0] || {};
  const holes = (layout.placed_items || layout.items || [])
    .map(item => transformPolygon(sourcePointsById.get(itemSourceId(item)?.toString()) || [], item))
    .map(normalizePolygon)
    .filter(points => points.length >= 3 && polygonArea(points) > 0);
  const outerArea = polygonArea(outer);
  const holesArea = holes.reduce((sum, points) => sum + polygonArea(points), 0);
  const remnantAreaMm2 = Math.max(outerArea - holesArea, 0);
  if (remnantAreaMm2 <= 0) return null;

  const bounds = polygonBounds(outer);
  const d = [
    polygonPath(outer),
    ...holes.map(points => polygonPath(points))
  ].filter(Boolean).join(' ');

  return {
    width: bounds.width,
    height: bounds.height,
    area: remnantAreaMm2 / 1000000,
    geometryData: {
      viewBox: `${bounds.minX} ${bounds.minY} ${Math.max(bounds.width, 1)} ${Math.max(bounds.height, 1)}`,
      polygon: { outer, inner: holes },
      layers: [
        {
          name: 'contour.material_sheet',
          standardCode: 'contour.material_sheet',
          paths: [polygonPath(outer)]
        },
        {
          name: 'cut.outer',
          standardCode: 'cut.outer',
          paths: holes.map(points => polygonPath(points)).filter(Boolean)
        },
        {
          name: 'remnant.usable',
          standardCode: 'remnant.usable',
          color: '#16a34a',
          weight: 1,
          paths: [{
            d,
            fill: 'layer',
            stroke: 'layer',
            opacity: 0.18,
            fillRule: 'evenodd'
          }]
        }
      ]
    }
  };
}

function itemSourceId(item = {}) {
  return item.item_id ?? item.itemId ?? item.id;
}

function itemTranslation(item = {}) {
  const translation = item.transformation?.translation;
  if (Array.isArray(translation) && translation.length >= 2) return translation;
  return [
    item.x ?? item.left ?? item.position?.x ?? 0,
    item.y ?? item.top ?? item.position?.y ?? 0
  ];
}

function itemRotation(item = {}) {
  return item.transformation?.rotation ?? item.rotation ?? item.angle ?? 0;
}

function transformPolygon(points = [], item = {}) {
  const [tx, ty] = itemTranslation(item);
  const x = Number(tx) || 0;
  const y = Number(ty) || 0;
  const angle = Number(itemRotation(item)) || 0;
  const radians = Math.abs(angle) > Math.PI * 2 ? (angle * Math.PI) / 180 : angle;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return points.map(([px, py]) => [
    x + px * cos - py * sin,
    y + px * sin + py * cos
  ]);
}

function normalizePolygon(points = []) {
  const normalized = (Array.isArray(points) ? points : [])
    .map(point => Array.isArray(point) && point.length >= 2 ? [Number(point[0]), Number(point[1])] : null)
    .filter(point => point && Number.isFinite(point[0]) && Number.isFinite(point[1]));
  if (normalized.length >= 3 && !samePoint(normalized[0], normalized[normalized.length - 1])) {
    normalized.push([...normalized[0]]);
  }
  return normalized;
}

function samePoint(left = [], right = []) {
  return Math.abs(Number(left[0]) - Number(right[0])) <= 0.001 &&
    Math.abs(Number(left[1]) - Number(right[1])) <= 0.001;
}

function polygonPath(points = []) {
  const normalized = normalizePolygon(points);
  if (normalized.length < 3) return null;
  return normalized.map((point, index) => `${index === 0 ? 'M' : 'L'} ${roundPoint(point[0])} ${roundPoint(point[1])}`).join(' ') + ' Z';
}

function polygonBounds(points = []) {
  const xs = points.map(point => Number(point[0])).filter(Number.isFinite);
  const ys = points.map(point => Number(point[1])).filter(Number.isFinite);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 1;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) : 1;
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function roundPoint(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function polygonArea(points = []) {
  const normalized = normalizePolygon(points);
  if (normalized.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < normalized.length - 1; index += 1) {
    const current = normalized[index];
    const next = normalized[index + 1];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(area) / 2;
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

export async function getArtifacts(queueId, userId, userOrg, userRole, userPermissions, runId) {
    const queue = await getById(queueId);
    if (!queue) throw createError({ statusCode: 404, message: 'Queue not found' });
    
    if (!hasLineagePermission(userPermissions, queue, 'queues', 'read')) {
        throw createError({ statusCode: 403, message: 'Permission denied' });
    }

    const { list: listArtifacts } = await import('../artifacts/service.js');
    const filter = { 'lineage.queueId': queueId };
    if (runId) filter['lineage.runId'] = runId;

    return await listArtifacts(filter);
}
