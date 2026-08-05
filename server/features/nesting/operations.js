import { createError } from 'h3';
import { getPrimaryState, inheritLineage } from '../../core/blocks/index.js';
import * as queuesService from '../queues/service.js';
import * as projectsService from '../projects/service.js';
import * as cassetteDesignService from '../cassette-designs/service.js';
import * as parametricCassettesService from '../parametric-cassettes/service.js';
import * as machinesService from '../machines/service.js';
import * as toolProfilesService from '../tool-profiles/service.js';
import * as nestingRunsRepository from '../nesting-runs/repository.js';
import * as nestingRunsService from '../nesting-runs/service.js';
import * as sheetDesignsService from '../sheet-designs/service.js';
import * as sheetsService from '../sheets/service.js';
import * as nestingJobs from './jobs.js';
import { createTaskRun, getTaskRunById } from '../../core/tasks/service.js';
import { statusService } from '../../core/machines/service.js';
import { generateRandomString } from '../../utils/strings.js';
import { toFlexibleId } from '../../utils/objectid.js';

const activeQueueNestLocks = new Set();

export async function solveNesting({ entities, parameters = {}, data = {}, auth }) {
  const queue = entities.queue;
  if (!queue) throw createError({ statusCode: 404, message: 'Queue not found' });
  const settings = {
    ...queuesService.getQueueNestingSettings(queue),
    ...data,
    ...parameters
  };
  const queueId = queue._id?.toString();

  if (activeQueueNestLocks.has(queueId)) {
    throw createError({ statusCode: 409, message: 'Queue nesting is already in progress' });
  }
  activeQueueNestLocks.add(queueId);

  try {
    await clearStaleActiveNestingJob(queue._id);
    if (await nestingJobs.findActiveByQueue(queue._id)) {
      throw createError({ statusCode: 400, message: 'Queue is already nesting' });
    }
    if (queuesService.queueCassetteDesignRefs(queue).length === 0) {
      throw createError({ statusCode: 400, message: 'Queue has no entries' });
    }
    const nestingSlug = `queue-${queue.data?.queueNumber ?? queue._id.toString().slice(-6)}-${generateRandomString(6)}`;
    const materialPool = resolveNestingMaterialPool(settings, queue);
    const execution = await resolveNestingExecution({
      ...settings,
      materialPool
    }, auth);
    const params = execution.params;
    const jobFiles = await buildJobFiles(queueWithMaterialThickness(queue, execution.materialSnapshot.thickness), auth);

    const runNumber = await nestingRunsService.getNextRunNumber(queue._id);
    const runUid = generateRandomString(12);
    const run = await nestingRunsService.create({
      identity: { uid: runUid, name: `Nesting run ${runNumber}`, serial: `RUN-${runNumber}` },
      runNumber,
      data: {
        runNumber,
        materialMode: execution.materialSnapshot.mode,
        params,
        materialPool,
        machineSnapshot: execution.machineSnapshot,
        toolSnapshot: execution.toolSnapshot,
        materialSnapshot: execution.materialSnapshot
      },
      lineage: inheritLineage(queue, 'queue')
    }, auth.userId);
    const runId = toFlexibleId(run._id);

    const taskRun = await createTaskRun('nesting.solve', {
      entities: {
        queue: queue._id?.toString(),
        nestingRun: runId.toString()
      },
      parameters: params
    }, auth);
    const project = queue.lineage?.projectId ? await projectsService.getById(queue.lineage.projectId).catch(() => null) : null;
    const projectSlug = project?.identity?.slug || project?.identity?.uid || '';
    const job = await nestingJobs.create({
      slug: nestingSlug,
      projectSlug,
      queueId: toFlexibleId(queue._id),
      runId,
      taskRunId: toFlexibleId(taskRun._id),
      files: jobFiles,
      params,
      materialPool,
      machineSnapshot: execution.machineSnapshot,
      toolSnapshot: execution.toolSnapshot,
      materialSnapshot: execution.materialSnapshot,
      status: 'pending',
      createdAt: new Date(),
      ownerId: auth.userId
    });

    const queueNestingEvent = await queueNestingRequestedEvent(queue, settings, taskRun, runId, auth);

    return {
      entities: [
        { type: 'nesting_run', id: runId.toString() }
      ],
      jobs: [
        { type: 'task_run', id: taskRun._id.toString() },
        { type: 'nesting_job', id: job._id.toString(), compatibility: true }
      ],
      events: queueNestingEvent ? [queueNestingEvent] : [],
      data: {
        nestingSlug,
        taskRunId: taskRun._id.toString(),
        runId: runId.toString()
      }
    };
  } finally {
    activeQueueNestLocks.delete(queueId);
  }
}

async function queueNestingRequestedEvent(queue, settings, taskRun, runId, auth) {
  const actions = await statusService.getActions('queue', queue._id, auth).catch(() => ({ actions: [] }));
  const canRequestNesting = actions.actions?.some(action => action.intent === 'requestNesting');
  if (!canRequestNesting) return null;
  return {
    type: 'queue.nestingRequested',
    source: { type: 'queue', id: queue._id?.toString() || queue._id },
    entities: [{ type: 'nesting_run', id: runId.toString() }],
    data: {
      materialMode: settings.materialMode || 'VIRTUAL',
      taskRunId: taskRun._id.toString(),
      runId: runId.toString()
    }
  };
}

export async function buildJobFiles(queue, auth) {
  const jobFiles = [];
  const evaluatedDesigns = new Map();
  for (const entry of queuesService.queueCassetteDesignRefs(queue)) {
    try {
      const entryParameters = entry.parameters || entry.dimensions || {};
      if (entry.type !== 'cassette_design') {
        throw createError({ statusCode: 400, message: `Queue item ${entry.id} must reference a cassette_design` });
      }
      const sourceDesign = await cassetteDesignService.getById(entry.id, auth.userId, auth.role, auth).catch(() => null);
      const item = await resolveQueueDesignGeometry({
        entry,
        sourceDesign,
        parameters: entryParameters,
        cache: evaluatedDesigns
      });
      if (!item) throw createError({ statusCode: 400, message: `Cassette design ${entry.id} not found` });

      jobFiles.push({
        cassetteId: item._id.toString(),
        count: 1,
        dimensions: item.data?.dimensions || item.data?.parameters || {},
        polygonParts: getPolygonParts(item),
        layerData: getLayerData(item)
      });
    } catch (error) {
      throw createError({ statusCode: 400, message: `Failed to process item ${entry.id}: ${error.message}` });
    }
  }
  return jobFiles;
}

async function resolveQueueDesignGeometry({ entry, sourceDesign, parameters = {}, cache = new Map() } = {}) {
  if (!sourceDesign) return null;
  const sourceParameters = hasEntries(sourceDesign.data?.parameters)
    ? sourceDesign.data.parameters
    : (sourceDesign.provenance?.derivedFrom?.parameters || {});
  const effectiveParameters = { ...sourceParameters, ...(parameters || {}) };
  const canDeriveParametricGeometry = hasEntries(sourceParameters);
  if (!canDeriveParametricGeometry || sameParameterMap(effectiveParameters, sourceParameters)) return sourceDesign;

  const sourceRef = sourceDesign.provenance?.derivedFrom?.source;
  if (sourceRef?.type !== 'cassette' || !sourceRef.id) {
    throw createError({ statusCode: 400, message: `Parametric cassette design ${entry.id} has no source cassette template provenance` });
  }

  const cacheKey = `${sourceRef.id}:${stableParameterKey(effectiveParameters)}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const evaluated = await parametricCassettesService.evaluateTemplate(sourceRef.id, effectiveParameters);
  const polygonParts = evaluated.nestingPolygons?.length ? evaluated.nestingPolygons : evaluated.polygons;
  if (!polygonParts?.length) {
    throw createError({ statusCode: 400, message: `Parametric cassette template ${sourceRef.id} produced no geometry` });
  }
  const design = {
    ...sourceDesign,
    data: {
      ...(sourceDesign.data || {}),
      parameters: evaluated.dimensions || effectiveParameters,
      polygonParts,
      layerData: evaluated.layerData || sourceDesign.data?.layerData || [],
      geometry: {
        ...(sourceDesign.data?.geometry || {}),
        data: {
          ...(sourceDesign.data?.geometry?.data || {}),
          dimensions: evaluated.dimensions || effectiveParameters,
          polygonParts,
          layerData: evaluated.layerData || sourceDesign.data?.geometry?.data?.layerData || []
        }
      }
    }
  };
  cache.set(cacheKey, design);
  return design;
}

function stableParameterKey(parameters = {}) {
  return JSON.stringify(Object.keys(parameters || {}).sort().map(key => [key, normalizeParameterValue(parameters[key])]));
}

function sameParameterMap(left = {}, right = {}) {
  return stableParameterKey(left) === stableParameterKey(right);
}

function normalizeParameterValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

export async function executeNestingSolveTask({ run, input, auth = {} }) {
  const queueId = input.entities?.queue;
  const runId = input.entities?.nestingRun;
  const queue = await queuesService.getById(queueId);
  if (!queue) throw createError({ statusCode: 404, message: 'Queue not found' });

  const job = await nestingJobs.findLatestByRun(runId);
  if (job) {
    await nestingJobs.updateById(job._id, { status: 'processing', startedAt: new Date() });
  }

  try {
    const jobFiles = job?.files?.length ? job.files : await buildJobFiles(queue, auth);
    const request = buildNestingWorkerRequest(jobFiles, input.parameters || {});
    const result = enrichNestingResult(await callNestingWorker(request), request);
    if (result.status === 'error') throw createError({ statusCode: 500, message: result.message || 'Nesting worker failed' });

    const summary = summarizeNestingResult(result, input.parameters || {});
    const currentRun = await nestingRunsRepository.findById(runId);
    const { sheetDesigns, sheets } = await createSheetDesignsForLayouts(currentRun, result, summary, input.parameters || {}, auth);
    const sheetDesignIds = sheetDesigns.map(design => design._id?.toString()).filter(Boolean);
    const sheetIds = sheets.map(sheet => sheet._id?.toString()).filter(Boolean);
    await nestingRunsRepository.updateById(runId, {
      data: {
        ...(currentRun?.data || {}),
        results: summary,
        layoutData: result,
        sheetDesignIds,
        sheetIds
      }
    });

    if (job) {
      await nestingJobs.updateById(job._id, {
        status: 'done',
        finishedAt: new Date(),
        result,
        emailNotify: job.projectSlug ? 'need_notify' : 'not_required'
      });
    }

    return {
      entities: [
        { type: 'nesting_run', id: runId },
        ...sheetDesignIds.map(id => ({ type: 'sheet_design', id })),
        ...sheetIds.map(id => ({ type: 'sheet', id }))
      ],
      events: [
        {
          type: 'nesting.solveCompleted',
          source: { type: 'nesting_run', id: runId },
          entities: [
            ...sheetDesignIds.map(id => ({ type: 'sheet_design', id })),
            ...sheetIds.map(id => ({ type: 'sheet', id }))
          ],
          data: { taskRunId: run._id.toString(), results: summary }
        }
      ],
      data: {
        runId,
        sheetDesignIds,
        sheetIds,
        results: summary
      }
    };
  } catch (error) {
    const finalFailure = isFinalTaskAttempt(run) || isNonRetryable(error);
    if (job) {
      await nestingJobs.updateById(job._id, {
        status: finalFailure ? 'error' : 'pending',
        finishedAt: new Date(),
        error: { message: error.message }
      });
    }
    if (finalFailure) {
      await markRunError(runId, run?._id, auth, error);
    }
    if (finalFailure) {
      error.events = [
        {
          type: 'nesting.solveFailed',
          source: { type: 'nesting_run', id: runId },
          entities: [{ type: 'queue', id: queueId }],
          data: { note: error.message || 'Nesting failed', runId, taskRunId: run?._id?.toString?.() || run?._id }
        }
      ];
    }
    throw error;
  }
}

export function buildNestingWorkerRequest(jobFiles, settings = {}) {
  const items = buildNestingItems(jobFiles);
  if (!items.length) throw createError({ statusCode: 400, message: 'No nestable cassette geometry found' });
  const params = resolveNestingParams(settings);
  return {
    items,
    params
  };
}

export function resolveNestingParams(settings = {}) {
  const context = resolveNestingContext(settings);
  return {
    width: context.width,
    height: context.height,
    space: context.space,
    sheetCount: context.sheetCount,
    sheet_polygon: context.sheet_polygon
  };
}

export function resolveNestingMaterialPool(settings = {}, queue = {}) {
  return Array.isArray(settings.materialPool) && settings.materialPool.length
    ? settings.materialPool
    : queue.data?.job?.materialPool || [];
}

export function resolveNestingContext(settings = {}) {
  const { machineSnapshot, toolSnapshot, materialSnapshot } = settings;
  if (!machineSnapshot?.source?.id) throw createError({ statusCode: 400, message: 'Machine snapshot is required' });
  if (!toolSnapshot?.source?.id) throw createError({ statusCode: 400, message: 'Tool snapshot is required' });
  if (!materialSnapshot?.mode) throw createError({ statusCode: 400, message: 'Material snapshot is required' });
  if (!(Number(toolSnapshot.kerf) > 0)) throw createError({ statusCode: 400, message: 'Selected tool must define a positive kerf' });
  if (!(Number(machineSnapshot.workingArea?.width) > 0) || !(Number(machineSnapshot.workingArea?.length) > 0)) {
    throw createError({ statusCode: 400, message: 'Selected machine must define a positive working area' });
  }
  if (!(Number(materialSnapshot.width) > 0) || !(Number(materialSnapshot.length) > 0) || !(Number(materialSnapshot.thickness) > 0)) {
    throw createError({ statusCode: 400, message: 'Selected material must define width, length, and thickness' });
  }
  if (!Number.isInteger(Number(materialSnapshot.sheetCount)) || Number(materialSnapshot.sheetCount) <= 0) {
    throw createError({ statusCode: 400, message: 'Selected material must provide at least one sheet' });
  }
  return {
    width: Number(materialSnapshot.width),
    height: Number(materialSnapshot.length),
    space: Number(toolSnapshot.kerf),
    sheetCount: Number(materialSnapshot.sheetCount),
    sheet_polygon: normalizeSheetPolygonShape(materialSnapshot.usableSheetPolygon),
    materialMode: materialSnapshot.mode,
    materialPool: materialSnapshot.sources || []
  };
}

export async function resolveNestingExecution(settings = {}, auth = {}) {
  if (!settings.machineId) throw createError({ statusCode: 400, message: 'Machine is required before nesting' });
  if (!settings.toolProfileId) throw createError({ statusCode: 400, message: 'Tool profile is required before nesting' });
  const [machine, tool] = await Promise.all([
    machinesService.getById(settings.machineId, auth.userId, auth.organizationId, auth.role, auth),
    toolProfilesService.getById(settings.toolProfileId, auth.userId)
  ]);
  const machineSnapshot = {
    source: { type: 'machine', id: machine._id.toString() },
    workingArea: {
      width: Number(machine.data?.workingArea?.width || 0),
      length: Number(machine.data?.workingArea?.length || 0)
    },
    boundaryOffset: Number(machine.data?.boundaryOffset || 0)
  };
  const toolSnapshot = {
    source: { type: 'tool_profile', id: tool._id.toString() },
    diameter: Number(tool.data?.diameter || 0),
    angle: Number(tool.data?.angle || 0),
    kerf: Number(tool.data?.kerf || 0)
  };
  if (!(toolSnapshot.kerf > 0)) throw createError({ statusCode: 400, message: 'Selected tool must define a positive kerf' });
  const materialSnapshot = await resolveMaterialSnapshot(settings, machineSnapshot);
  const context = { machineSnapshot, toolSnapshot, materialSnapshot };
  return { ...context, params: resolveNestingParams(context) };
}

async function resolveMaterialSnapshot(settings, machineSnapshot) {
  const materialPool = Array.isArray(settings.materialPool) ? settings.materialPool : [];
  const warehouse = settings.materialMode === 'WAREHOUSE';
  const stockSources = materialPool.map(normalizeMaterialPoolSource);
  if (warehouse && !stockSources.length) {
    throw createError({ statusCode: 400, message: 'Warehouse material is required before nesting' });
  }
  const width = warehouse ? stockSources[0]?.width : Number(settings.virtualWidth || 0);
  const length = warehouse ? stockSources[0]?.height : Number(settings.virtualLength || 0);
  const thickness = warehouse ? stockSources[0]?.thickness : Number(settings.virtualThickness || 0);
  if (!(width > 0) || !(length > 0) || !(thickness > 0)) {
    throw createError({ statusCode: 400, message: 'Material width, length, and thickness are required before nesting' });
  }
  if (warehouse) {
    const sizeKeys = new Set(stockSources.map(source => `${source.width}x${source.height}x${source.thickness}`));
    if (sizeKeys.size > 1) throw createError({ statusCode: 400, message: 'Selected warehouse stock must share one sheet size and thickness' });
  }
  if (width > machineSnapshot.workingArea.width || length > machineSnapshot.workingArea.length) {
    throw createError({ statusCode: 400, message: 'Selected material does not fit the machine working area' });
  }
  const physicalPolygon = stockSources[0]?.sheetPolygon || {
    outer: [[0, 0], [width, 0], [width, length], [0, length], [0, 0]],
    inner: []
  };
  const usableSheetPolygon = await insetSheetPolygon(physicalPolygon, machineSnapshot.boundaryOffset);
  return {
    mode: warehouse ? 'WAREHOUSE' : 'VIRTUAL',
    width,
    length,
    thickness,
    sheetCount: warehouse ? stockSources.reduce((sum, source) => sum + source.available, 0) : Number(settings.sheetCount || 1000),
    sources: warehouse ? stockSources.map(source => ({
      type: source.type,
      id: source.id?.toString?.() || source.id,
      available: source.available
    })) : [],
    physicalSheetPolygon: normalizeSheetPolygonShape(physicalPolygon),
    usableSheetPolygon
  };
}

export async function insetSheetPolygon(polygon, offset = 0) {
  const normalized = normalizeSheetPolygonShape(polygon);
  if (!normalized) throw createError({ statusCode: 400, message: 'Material sheet polygon is invalid' });
  const inset = Number(offset || 0);
  if (!(inset > 0)) return normalized;
  const { default: createClipper } = await import('clipper2-wasm');
  const clipper = await createClipper();
  const paths = new clipper.PathsD();
  try {
    const orientedRings = [
      orientRing(normalized.outer, true),
      ...normalized.inner.map(ring => orientRing(ring, false))
    ];
    for (const ring of orientedRings) {
      const path = new clipper.PathD();
      for (const [x, y] of ring.slice(0, -1)) {
        const point = new clipper.PointD(x, y, 0);
        path.push_back(point);
        point.delete();
      }
      paths.push_back(path);
      path.delete();
    }
    const result = clipper.InflatePathsD(paths, -inset, clipper.JoinType.Miter, clipper.EndType.Polygon, 2, 3, 0);
    try {
      const rings = [];
      for (let index = 0; index < result.size(); index += 1) {
        const path = result.get(index);
        const ring = [];
        for (let pointIndex = 0; pointIndex < path.size(); pointIndex += 1) {
          const point = path.get(pointIndex);
          ring.push([point.x, point.y]);
          point.delete();
        }
        path.delete();
        const closed = normalizeSheetPolygon(ring);
        if (closed) rings.push(closed);
      }
      if (!rings.length) throw createError({ statusCode: 400, message: 'Machine boundary offset leaves no usable material area' });
      const outerRings = rings.filter(ring => signedPolygonArea(ring) > 0);
      const innerRings = rings.filter(ring => signedPolygonArea(ring) < 0);
      if (outerRings.length !== 1) {
        throw createError({ statusCode: 400, message: 'Machine boundary offset creates disconnected usable material areas' });
      }
      return {
        outer: orientRing(outerRings[0], true),
        inner: innerRings.map(ring => orientRing(ring, false))
      };
    } finally {
      result.delete();
    }
  } finally {
    paths.delete();
  }
}

function signedPolygonArea(ring = []) {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  let twiceArea = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    twiceArea += x1 * y2 - x2 * y1;
  }
  return twiceArea / 2;
}

function orientRing(ring, counterClockwise) {
  const normalized = normalizeSheetPolygon(ring);
  if (!normalized) return ring;
  const isCounterClockwise = signedPolygonArea(normalized) > 0;
  const points = normalized.slice(0, -1);
  if (isCounterClockwise !== counterClockwise) points.reverse();
  const firstIndex = points.reduce((bestIndex, point, index) => {
    const best = points[bestIndex];
    return point[0] < best[0] || (point[0] === best[0] && point[1] < best[1]) ? index : bestIndex;
  }, 0);
  const canonical = [...points.slice(firstIndex), ...points.slice(0, firstIndex)];
  return [...canonical, canonical[0]];
}

function queueWithMaterialThickness(queue, thickness) {
  return {
    ...queue,
    relations: {
      ...(queue.relations || {}),
      cassettes: queuesService.queueCassetteDesignRefs(queue).map(item => ({
        ...item,
        parameters: { ...(item.parameters || {}), T: thickness }
      }))
    }
  };
}

export function enrichNestingResult(result = {}, request = {}) {
  const params = request.params || {};
  const width = Number(params.width || 1220);
  const height = Number(params.height || 2440);
  const requestItems = request.items || [];
  const resultItemsById = new Map((Array.isArray(result.items) ? result.items : [])
    .map(item => [item.id?.toString(), item])
    .filter(([id]) => id !== undefined));
  const enrichedItems = requestItems.map(requestItem => {
    const item = resultItemsById.get(requestItem.id?.toString()) || {};
    resultItemsById.delete(requestItem.id?.toString());
    return {
      ...item,
      id: requestItem.id,
      cassette_id: item.cassette_id || requestItem.cassette_id,
      handles: item.handles?.length ? item.handles : requestItem.handles || [],
      sourceLayers: item.sourceLayers?.length ? item.sourceLayers : requestItem.sourceLayers || [],
      demand: item.demand ?? requestItem.count ?? 1,
      shape: item.shape?.data?.length ? item.shape : {
        type: 'simple_polygon',
        data: requestItem.coords || []
      }
    };
  });
  enrichedItems.push(...Array.from(resultItemsById.values()));
  if (!enrichedItems.length) {
    enrichedItems.push(...requestItems.map(item => ({
      id: item.id,
      cassette_id: item.cassette_id,
      handles: item.handles || [],
      sourceLayers: item.sourceLayers || [],
      demand: item.count || 1,
      shape: {
        type: 'simple_polygon',
        data: item.coords || []
      }
    })));
  }
  return {
    ...result,
    items: enrichedItems,
    bins: Array.isArray(result.bins) && result.bins.length
      ? result.bins
      : [{
        id: 0,
        shape: {
          type: 'polygon',
          data: fallbackBinShapeData(params, width, height)
        },
        stock: params.sheetCount || 1
      }]
  };
}

async function createSheetDesignsForLayouts(run, result, summary, params, auth = {}) {
  const groups = sheetDesignsService.collapseNestingLayoutsByComposition(result);
  const specs = {
    width: Number(params.width || params.virtualWidth || 1220),
    length: Number(params.height || params.virtualLength || 2440)
  };
  specs.area = (specs.width * specs.length) / 1000000;

  const runName = run?.identity?.name || run?._id?.toString() || 'Nesting run';
  const sheetDesigns = [];
  const sheets = [];
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    const sheetResult = sheetDesignsService.nestingResultForLayout(result, group.representativeLayoutIndex);
    const sheetSummary = summarizeNestingResult(sheetResult, params);
    const design = await sheetDesignsService.createFromRun(run, {
      name: `${runName} design ${index + 1}`,
      serial: `${run?.identity?.serial || run?._id || 'RUN'}-S${index + 1}`,
      specs,
      geometry: {
        data: sheetResult,
        preview: sheetDesignsService.nestingResultToPreview(result, params, { layoutIndex: group.representativeLayoutIndex }),
        summary: sheetSummary
      },
      cassetteDesigns: group.composition,
      compositionHash: group.compositionHash,
      sheetCount: group.sheetCount,
      materialPool: run?.data?.materialPool || [],
      solveParams: params,
      machineSnapshot: run?.data?.machineSnapshot || null,
      toolSnapshot: run?.data?.toolSnapshot || null,
      materialSnapshot: run?.data?.materialSnapshot || null,
      summary: sheetSummary || summary
    }, auth.userId || 'SYSTEM');
    sheetDesigns.push(design);
    sheets.push(...await sheetsService.createFromSheetDesign(design, group.sheetCount, {
      organizationId: auth.organizationId || run?.lineage?.organizationId,
      userId: auth.userId || 'SYSTEM'
    }));
  }
  return { sheetDesigns, sheets };
}

export function summarizeNestingResult(result = {}, params = {}) {
  const layouts = result.solution?.layouts || result.layouts || [];
  const placedCount = layouts.reduce((sum, layout) => sum + (layout.placed_items?.length || layout.items?.length || 0), 0);
  const sheetCount = layouts.length;
  const density = result.solution?.density ?? averageLayoutDensity(layouts);
  const sheetArea = nestingSheetArea(result, params);
  const efficiency = firstFinite([
    result.stats?.efficiency,
    result.efficiency,
    percentFromDensity(density),
    percentFromPlacedArea(result, layouts, sheetArea)
  ]);
  const remnantArea = firstFinite([
    result.stats?.remnantArea,
    result.remnantArea,
    remnantAreaFromDensity(density, sheetArea, sheetCount),
    remnantAreaFromPlacedArea(result, layouts, sheetArea, sheetCount)
  ]);
  return {
    efficiency,
    sheetCount,
    remnantArea,
    placedCount
  };
}

function firstFinite(values = []) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return Math.round(number * 100) / 100;
  }
  return 0;
}

function averageLayoutDensity(layouts = []) {
  const densities = layouts.map(layout => Number(layout.density)).filter(Number.isFinite);
  if (!densities.length) return null;
  return densities.reduce((sum, density) => sum + density, 0) / densities.length;
}

function percentFromDensity(density) {
  if (density === null || density === undefined || density === '') return null;
  const number = Number(density);
  if (!Number.isFinite(number)) return null;
  return number <= 1 ? number * 100 : number;
}

function remnantAreaFromDensity(density, sheetArea, sheetCount) {
  if (density === null || density === undefined || density === '') return null;
  const number = Number(density);
  if (!Number.isFinite(number) || !sheetArea || !sheetCount) return null;
  const ratio = number <= 1 ? number : number / 100;
  return Math.max(sheetArea * sheetCount * (1 - ratio), 0) / 1000000;
}

function percentFromPlacedArea(result, layouts, sheetArea) {
  const placedArea = nestingPlacedArea(result, layouts);
  if (!placedArea || !sheetArea || !layouts.length) return null;
  return (placedArea / (sheetArea * layouts.length)) * 100;
}

function remnantAreaFromPlacedArea(result, layouts, sheetArea, sheetCount) {
  const placedArea = nestingPlacedArea(result, layouts);
  if (!sheetArea || !sheetCount) return null;
  return Math.max(sheetArea * sheetCount - placedArea, 0) / 1000000;
}

function nestingSheetArea(result = {}, params = {}) {
  const paramShapeArea = polygonShapeArea(params.sheet_polygon);
  if (paramShapeArea > 0) return paramShapeArea;
  const binOuter = result.bins?.[0]?.shape?.data?.outer;
  const binInner = result.bins?.[0]?.shape?.data?.inner || [];
  const binShapeArea = polygonShapeArea({ outer: binOuter, inner: binInner });
  if (binShapeArea > 0) return binShapeArea;
  const width = Number(params.width || params.virtualWidth || 0);
  const height = Number(params.height || params.virtualLength || 0);
  return width > 0 && height > 0 ? width * height : 0;
}

function nestingPlacedArea(result = {}, layouts = []) {
  const sourceAreas = new Map((result.items || [])
    .map(item => [item.id?.toString(), polygonArea(item.shape?.data || item.coords || item.coordinates)])
    .filter(([id, area]) => id !== undefined && area > 0));
  return layouts.reduce((sum, layout) => {
    const items = layout.placed_items || layout.items || [];
    return sum + items.reduce((layoutSum, item) => {
      const id = item.item_id ?? item.itemId ?? item.id;
      return layoutSum + (sourceAreas.get(id?.toString()) || 0);
    }, 0);
  }, 0);
}

function polygonArea(points = []) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (!Array.isArray(current) || !Array.isArray(next)) continue;
    const x1 = Number(current[0]);
    const y1 = Number(current[1]);
    const x2 = Number(next[0]);
    const y2 = Number(next[1]);
    if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) continue;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

function polygonShapeArea(shape = null) {
  const normalized = normalizeSheetPolygonShape(shape);
  if (!normalized) return 0;
  const outerArea = polygonArea(normalized.outer);
  const innerArea = normalized.inner.reduce((sum, ring) => sum + polygonArea(ring), 0);
  return Math.max(outerArea - innerArea, 0);
}

function fallbackBinShapeData(params = {}, width = 0, height = 0) {
  const sheetPolygon = normalizeSheetPolygonShape(params.sheet_polygon);
  if (sheetPolygon) return sheetPolygon;
  return {
    outer: [[0, 0], [width, 0], [width, height], [0, height], [0, 0]],
    inner: []
  };
}

function buildNestingItems(jobFiles = []) {
  let id = 0;
  const items = [];
  for (const file of jobFiles) {
    const count = Number(file.count || file.quantity || 1);
    const polygonParts = file.polygonParts || [];
    const layerData = file.layerData || [];
    if (polygonParts.length) {
      for (const part of polygonParts) {
        const coords = normalizeCoordinates(part.coordinates);
        if (!isValidPolygonCoordinates(coords)) continue;
        items.push({
          id,
          cassette_id: file.cassetteId,
          coords,
          handles: part.handles || [],
          sourceLayers: sourceLayersForPart(layerData, part),
          count
        });
        id += 1;
      }
      continue;
    }

    const rectangle = rectangleFromDimensions(file.dimensions || {});
    if (!rectangle.length) continue;
    items.push({
      id,
      cassette_id: file.cassetteId,
      coords: rectangle,
      handles: [],
      sourceLayers: sourceLayersForPart(layerData, {}),
      count
    });
    id += 1;
  }
  return items;
}

function getPolygonParts(entity = {}) {
  return entity.data?.polygonParts
    || entity.polygonParts
    || entity.data?.geometry?.data?.polygonParts
    || [];
}

function getLayerData(entity = {}) {
  return entity.data?.layerData
    || entity.layerData
    || entity.data?.geometry?.data?.layerData
    || [];
}

function sourceLayersForPart(layerData = [], part = {}) {
  return layerData.filter(layer => (
    !layer.workpieceId ||
    !part.workpieceId ||
    layer.workpieceId === part.workpieceId
  ));
}

function hasEntries(value = {}) {
  return value && typeof value === 'object' && Object.keys(value).length > 0;
}

function normalizeCoordinates(coords = []) {
  return coords
    .filter(point => Array.isArray(point) && point.length >= 2)
    .map(point => [Number(point[0]), Number(point[1])])
    .filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]));
}

function uniquePointCount(coords = []) {
  return new Set(coords.map(point => `${roundCoord(point[0])}:${roundCoord(point[1])}`)).size;
}

function roundCoord(value) {
  return Math.round(Number(value) * 1000000) / 1000000;
}

function isValidPolygonCoordinates(coords = []) {
  if (!Array.isArray(coords) || coords.length < 3) return false;
  if (uniquePointCount(coords) < 3) return false;
  return polygonArea(coords) > 0.000001;
}

function rectangleFromDimensions(dimensions = {}) {
  const values = Object.values(dimensions).map(Number).filter(Number.isFinite);
  if (values.length < 2) return [];
  const [width, height] = values;
  if (width <= 0 || height <= 0) return [];
  return [[0, 0], [width, 0], [width, height], [0, height], [0, 0]];
}

function normalizeMaterialPoolSource(source = {}) {
  const dimensions = source.dimensions || source.specsData || source.sheet || {};
  const parsed = parseDimensionText(source.specs || source.label || '');
  const width = Number(dimensions.width || dimensions.w || parsed.width || 0);
  const height = Number(dimensions.length || dimensions.height || dimensions.h || parsed.height || 0);
  const available = Number(source.available || source.availableCount || source.quantity || source.count || 1);
  const thickness = Number(dimensions.thickness || source.thickness || 0);
  const sheetPolygon = resolveMaterialSheetPolygon(source);
  return {
    ...source,
    width,
    height,
    thickness,
    sheetPolygon,
    available: Number.isFinite(available) && available > 0 ? Math.floor(available) : 1
  };
}

function resolveMaterialSheetPolygon(source = {}) {
  return normalizeSheetPolygonShape(
    source.sheet_polygon ||
    source.sheetPolygon ||
    source.geometry?.polygon ||
    source.geometryData?.polygon ||
    source.data?.geometryData?.polygon ||
    source.data?.geometry?.data?.polygon ||
    source.data?.geometry?.polygon ||
    source.geometry?.data?.polygon ||
    source.geometry?.polygon?.outer ||
    source.geometryData?.polygon?.outer ||
    source.data?.geometryData?.polygon?.outer ||
    source.data?.geometry?.data?.polygon?.outer ||
    source.data?.geometry?.polygon?.outer ||
    source.geometry?.data?.polygon?.outer ||
    firstPolygonPartCoordinates(source.geometryData?.polygonParts) ||
    firstPolygonPartCoordinates(source.data?.geometry?.data?.polygonParts)
  );
}

function firstPolygonPartCoordinates(parts = []) {
  const part = Array.isArray(parts) ? parts.find(item => Array.isArray(item?.coordinates)) : null;
  return part?.coordinates || null;
}

function normalizeSheetPolygonShape(polygon = null) {
  if (polygon && !Array.isArray(polygon) && typeof polygon === 'object') {
    const outer = normalizeSheetPolygon(polygon.outer || polygon.data?.outer || []);
    if (!outer) return null;
    const inner = (polygon.inner || polygon.data?.inner || [])
      .map(normalizeSheetPolygon)
      .filter(Boolean);
    return { outer, inner };
  }
  const outer = normalizeSheetPolygon(polygon);
  return outer ? { outer, inner: [] } : null;
}

function normalizeSheetPolygon(points = []) {
  const normalized = normalizeCoordinates(Array.isArray(points) ? points : []);
  if (!isValidPolygonCoordinates(normalized)) return null;
  if (!sameCoordinate(normalized[0], normalized[normalized.length - 1])) {
    normalized.push([...normalized[0]]);
  }
  return normalized;
}

function sameCoordinate(left = [], right = []) {
  return Math.abs(Number(left[0]) - Number(right[0])) <= 0.001 &&
    Math.abs(Number(left[1]) - Number(right[1])) <= 0.001;
}

function parseDimensionText(text = '') {
  const match = String(text).match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  if (!match) return {};
  return {
    width: Number(match[1]),
    height: Number(match[2])
  };
}

async function callNestingWorker(request) {
  const url = process.env.NESTING_WORKER_URL || 'http://nesting-worker:8000/nest';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request)
  });
  if (!response.ok) {
    const body = await response.text();
    throw createError({ statusCode: 502, message: `Nesting worker failed: ${body || response.statusText}` });
  }
  return await response.json();
}

async function clearStaleActiveNestingJob(queueId) {
  const job = await nestingJobs.findActiveByQueue(queueId);
  if (!job?.taskRunId) return;
  const taskRun = await getTaskRunById(job.taskRunId);
  if (!taskRun || ['FAILED', 'CANCELLED'].includes(taskRun.status)) {
    await nestingJobs.updateById(job._id, {
      status: 'error',
      finishedAt: new Date(),
      error: job.error || { message: 'Nesting task is no longer active' }
    });
  }
}

async function markRunError(runId, taskRunId, auth, error) {
  const currentRun = await nestingRunsRepository.findById(runId);
  if (!currentRun) return;
  await nestingRunsRepository.updateById(runId, {
    data: {
      ...(currentRun?.data || {}),
      error: error.message
    }
  });
}

function isFinalTaskAttempt(run = {}) {
  return Number(run.attempts || 1) >= Number(run.maxAttempts || 1);
}

function isNonRetryable(error = {}) {
  return error.statusCode >= 400 && error.statusCode < 500;
}
