import { createError } from 'h3';
import { createStatus, inheritLineage } from '../../core/blocks/index.js';
import * as queuesService from '../queues/service.js';
import * as projectsService from '../projects/service.js';
import * as cassetteService from '../cassettes/service.js';
import * as cassetteDesignService from '../cassette-designs/service.js';
import { bakeTemplateInstance } from '../parametric-cassettes/service.js';
import * as nestingRunsRepository from '../nesting-runs/repository.js';
import * as nestingRunsService from '../nesting-runs/service.js';
import * as sheetDesignsService from '../sheet-designs/service.js';
import * as nestingJobs from './jobs.js';
import { createTransitionAuth, statusService } from '../../core/machines/service.js';
import { createTaskRun } from '../../core/tasks/service.js';
import { generateRandomString } from '../../utils/strings.js';
import { toFlexibleId } from '../../utils/objectid.js';

const activeQueueNestLocks = new Set();

export async function solveNesting({ entities, parameters = {}, data = {}, auth }) {
  const settings = { ...data, ...parameters };
  const queue = entities.queue;
  const queueId = queue._id?.toString();

  if (activeQueueNestLocks.has(queueId)) {
    throw createError({ statusCode: 409, message: 'Queue nesting is already in progress' });
  }
  activeQueueNestLocks.add(queueId);

  try {
    if (!queue) throw createError({ statusCode: 404, message: 'Queue not found' });
    if (await nestingJobs.findActiveByQueue(queue._id) || queue.status?.state === 'NESTING') {
      throw createError({ statusCode: 400, message: 'Queue is already nesting' });
    }
    if (!queue.data?.job?.items || queue.data.job.items.length === 0) {
      throw createError({ statusCode: 400, message: 'Queue has no entries' });
    }

    const jobFiles = await buildJobFiles(queue, auth);
    const nestingSlug = `queue-${queue.data?.queueNumber ?? queue._id.toString().slice(-6)}-${generateRandomString(6)}`;
    const params = {
      height: settings.virtualLength || settings.height || 2440,
      width: settings.virtualWidth || settings.width || 1220,
      space: settings.spacing || settings.space || 5,
      sheetCount: 1000,
      sheet_polygon: settings.sheet_polygon || null,
      inventoryItems: settings.inventoryItems || []
    };

    const runNumber = await nestingRunsService.getNextRunNumber(queue._id);
    const runUid = generateRandomString(12);
    const runOrigin = createStatus('NESTING', auth.userId, { note: `Nesting started in ${settings.materialMode || 'VIRTUAL'} mode` });
    const run = await nestingRunsService.create({
      identity: { uid: runUid, name: `Nesting run ${runNumber}`, serial: `RUN-${runNumber}` },
      runNumber,
      materialMode: settings.materialMode || 'VIRTUAL',
      params,
      origin: runOrigin,
      status: runOrigin,
      lineage: inheritLineage(queue, 'queue')
    }, auth.userId);
    const runId = toFlexibleId(run._id);

    const sheetDesign = await sheetDesignsService.createFromRun(run, {
      name: `${queue.identity?.name || 'Queue'} sheet design`,
      specs: { width: params.width, length: params.height, area: (params.width * params.height) / 1000000 },
      geometryData: {
        viewBox: `0 0 ${params.width} ${params.height}`,
        layers: [
          { name: 'sheet', color: 'currentColor', weight: 2, paths: [`M0 0 H${params.width} V${params.height} H0 Z`] },
          { name: 'nesting', color: 'var(--p-primary-color)', weight: 1.5, paths: ['M80 80 H520 V360 H80 Z', 'M620 80 H1040 V420 H620 Z'] }
        ]
      }
    }, auth.userId);
    const taskRun = await createTaskRun('nesting.solve', {
      entities: {
        queue: queue._id?.toString(),
        nestingRun: runId.toString(),
        sheetDesign: sheetDesign._id.toString()
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
      status: 'pending',
      createdAt: new Date(),
      ownerId: auth.userId
    });

    return {
      entities: [
        { type: 'nesting_run', id: runId.toString() },
        { type: 'sheet_design', id: sheetDesign._id.toString() }
      ],
      jobs: [
        { type: 'task_run', id: taskRun._id.toString() },
        { type: 'nesting_job', id: job._id.toString(), compatibility: true }
      ],
      data: {
        nestingSlug,
        status: 'NESTING',
        taskRunId: taskRun._id.toString(),
        runId: runId.toString(),
        sheetDesignId: sheetDesign._id.toString()
      }
    };
  } finally {
    activeQueueNestLocks.delete(queueId);
  }
}

async function buildJobFiles(queue, auth) {
  const jobFiles = [];
  for (const entry of queue.data.job.items) {
    try {
      if (entry.type === 'PARAMETRIC') {
        const template = await cassetteService.getById(entry.id, auth.userId, auth.organizationId, auth.role, auth);
        const bakedCassette = await bakeTemplateInstance(toFlexibleId(template._id), entry.parameters || {}, auth.userId);
        jobFiles.push({
          cassetteId: bakedCassette._id.toString(),
          count: entry.quantity,
          dimensions: entry.parameters || bakedCassette.data?.dimensions || {},
          polygonParts: getPolygonParts(bakedCassette)
        });
        continue;
      }

      let item = await cassetteDesignService.getById(entry.id, auth.userId, auth.role, auth).catch(() => null);
      if (!item) {
        item = await cassetteService.getById(entry.id, auth.userId, auth.organizationId, auth.role, auth).catch(() => null);
      }
      if (!item) throw createError({ statusCode: 400, message: `Cassette item ${entry.id} not found in any collection` });

      jobFiles.push({
        cassetteId: item._id.toString(),
        count: entry.quantity,
        dimensions: entry.parameters || item.data?.dimensions || item.data?.parameters || {},
        polygonParts: getPolygonParts(item)
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
  const sheetDesignId = input.entities?.sheetDesign;
  const queue = await queuesService.getById(queueId);
  if (!queue) throw createError({ statusCode: 404, message: 'Queue not found' });

  const job = await nestingJobs.findLatestByRun(runId);
  if (job) {
    await nestingJobs.updateById(job._id, { status: 'processing', startedAt: new Date() });
  }

  try {
    const jobFiles = job?.files?.length ? job.files : await buildJobFiles(queue, auth);
    const request = buildNestingWorkerRequest(jobFiles, input.parameters || {});
    const result = await callNestingWorker(request);
    if (result.status === 'error') throw createError({ statusCode: 500, message: result.message || 'Nesting worker failed' });

    const summary = summarizeNestingResult(result);
    const currentRun = await nestingRunsRepository.findById(runId);
    await nestingRunsRepository.updateById(runId, {
      data: {
        ...(currentRun?.data || {}),
        results: summary,
        layoutData: result
      }
    });
    await statusService.transition(
      'nesting_run',
      runId,
      'COMPLETE',
      auth.userId || 'SYSTEM',
      createTransitionAuth(auth.userId || 'SYSTEM', 'SYSTEM'),
      { note: 'Nesting calculation completed', taskRunId: run._id.toString() }
    );

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
        { type: 'sheet_design', id: sheetDesignId }
      ],
      data: {
        status: 'COMPLETE',
        runId,
        sheetDesignId,
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
    throw error;
  }
}

export function buildNestingWorkerRequest(jobFiles, settings = {}) {
  const items = buildNestingItems(jobFiles);
  if (!items.length) throw createError({ statusCode: 400, message: 'No nestable cassette geometry found' });
  return {
    items,
    params: {
      width: settings.virtualWidth || settings.width || 1220,
      height: settings.virtualLength || settings.height || 2440,
      space: settings.spacing || settings.space || 5,
      sheetCount: settings.sheetCount || 1000,
      sheet_polygon: settings.sheet_polygon || null
    }
  };
}

export function summarizeNestingResult(result = {}) {
  const layouts = result.solution?.layouts || result.layouts || [];
  const placedCount = layouts.reduce((sum, layout) => sum + (layout.placed_items?.length || layout.items?.length || 0), 0);
  return {
    efficiency: Number(result.stats?.efficiency || result.efficiency || 0),
    sheetCount: layouts.length,
    remnantArea: Number(result.stats?.remnantArea || result.remnantArea || 0),
    placedCount
  };
}

function buildNestingItems(jobFiles = []) {
  let id = 0;
  const items = [];
  for (const file of jobFiles) {
    const count = Number(file.count || file.quantity || 1);
    const polygonParts = file.polygonParts || [];
    if (polygonParts.length) {
      for (const part of polygonParts) {
        const coords = normalizeCoordinates(part.coordinates);
        if (!coords.length) continue;
        items.push({
          id,
          cassette_id: file.cassetteId,
          coords,
          handles: part.handles || [],
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

function normalizeCoordinates(coords = []) {
  return coords
    .filter(point => Array.isArray(point) && point.length >= 2)
    .map(point => [Number(point[0]), Number(point[1])])
    .filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]));
}

function rectangleFromDimensions(dimensions = {}) {
  const values = Object.values(dimensions).map(Number).filter(Number.isFinite);
  if (values.length < 2) return [];
  const [width, height] = values;
  if (width <= 0 || height <= 0) return [];
  return [[0, 0], [width, 0], [width, height], [0, height], [0, 0]];
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

async function markRunError(runId, taskRunId, auth, error) {
  const currentRun = await nestingRunsRepository.findById(runId);
  if (!currentRun) return;
  await nestingRunsRepository.updateById(runId, {
    data: {
      ...(currentRun?.data || {}),
      error: error.message
    }
  });
  await statusService.transition(
    'nesting_run',
    runId,
    'ERROR',
    auth.userId || 'SYSTEM',
    createTransitionAuth(auth.userId || 'SYSTEM', 'SYSTEM'),
    { note: error.message, taskRunId: taskRunId?.toString() }
  );
}

function isFinalTaskAttempt(run = {}) {
  return Number(run.attempts || 1) >= Number(run.maxAttempts || 1);
}

function isNonRetryable(error = {}) {
  return error.statusCode >= 400 && error.statusCode < 500;
}
