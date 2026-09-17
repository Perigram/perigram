// Nesting command/executor (κ): auth, persistence, and worker orchestration.
// Pure geometry/value projections live in projections.js (π); this module
// owns declared effects and the materializer, per packages/cts SPEC §8.
import { createError } from 'h3';
import { inheritLineage } from '../../core/blocks/index.js';
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
import {
  buildNestingWorkerRequest,
  enrichNestingResult,
  insetSheetPolygon,
  normalizeMaterialPoolSource,
  normalizeSheetPolygonShape,
  resolveNestingContext,
  resolveNestingMaterialPool,
  resolveNestingParams,
  resolveQueueDesignGeometry,
  summarizeNestingResult,
  getLayerData,
  getPolygonParts
} from './projections.js';

export {
  buildNestingWorkerRequest,
  enrichNestingResult,
  insetSheetPolygon,
  resolveNestingContext,
  resolveNestingMaterialPool,
  resolveNestingParams,
  summarizeNestingResult
} from './projections.js';

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
        materialPool
      },
      lineage: inheritLineage(queue, 'queue'),
      provenance: {
        solve: {
          source: { type: 'queue', id: queue._id?.toString() || queue._id },
          effective: {
            machine: execution.machineSnapshot,
            tool: execution.toolSnapshot,
            material: execution.materialSnapshot
          }
        }
      }
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
        evaluateTemplate: parametricCassettesService.evaluateTemplate,
        cache: evaluatedDesigns
      });
      if (!item) throw createError({ statusCode: 400, message: `Cassette design ${entry.id} not found` });

      jobFiles.push({
        cassetteId: item._id.toString(),
        count: Math.max(1, Math.trunc(Number(entry.quantity) || 1)),
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
