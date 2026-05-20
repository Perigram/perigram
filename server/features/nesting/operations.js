import { createError } from 'h3';
import { registerServiceActionHandler } from '../../core/blocks/index.js';
import { createStatus, inheritLineage } from '../../core/blocks/index.js';
import '../queues/service.js';
import * as cassetteService from '../cassettes/service.js';
import * as cassetteDesignService from '../cassette-designs/service.js';
import { bakeTemplateInstance } from '../parametric-cassettes/service.js';
import * as nestingRunsService from '../nesting-runs/service.js';
import * as nestingJobs from './jobs.js';
import { generateRandomString } from '../../utils/strings.js';
import { toFlexibleId } from '../../utils/objectid.js';

const activeQueueNestLocks = new Set();

registerServiceActionHandler('solveNesting', solveNesting);

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
    const runOrigin = createStatus('NESTING', auth.userId, { note: `Nesting started in ${settings.materialMode || 'VIRTUAL'} mode` });
    const run = await nestingRunsService.create({
      identity: { uid: generateRandomString(12) },
      runNumber,
      materialMode: settings.materialMode || 'VIRTUAL',
      params,
      origin: runOrigin,
      status: runOrigin,
      lineage: inheritLineage(queue, 'queue')
    }, auth.userId);
    const runId = toFlexibleId(run._id);

    const job = await nestingJobs.create({
      slug: nestingSlug,
      projectSlug: queue.identity?.slug || '',
      queueId: toFlexibleId(queue._id),
      runId,
      files: jobFiles,
      params,
      status: 'pending',
      createdAt: new Date(),
      ownerId: auth.userId
    });

    return {
      entities: [{ type: 'nesting_run', id: runId.toString() }],
      jobs: [{ type: 'nesting_job', id: job._id.toString() }],
      data: {
        nestingSlug,
        status: 'NESTING',
        runId: runId.toString()
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
          dimensions: entry.parameters || {}
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
        dimensions: entry.parameters || {}
      });
    } catch (error) {
      throw createError({ statusCode: 400, message: `Failed to process item ${entry.id}: ${error.message}` });
    }
  }
  return jobFiles;
}
