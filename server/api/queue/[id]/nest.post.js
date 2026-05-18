/**
 * POST /api/queue/:id/nest
 * 
 * Trigger nesting for a queue
 */

import * as queuesService from '../../../features/queues/service.js';
import * as cassetteService from '../../../features/cassettes/service.js';
import * as cassetteDesignService from '../../../features/cassette-designs/service.js';
import { service as artifactService } from '../../../features/artifacts/index.js';
import { bakeTemplateInstance } from '../../../features/parametric-cassettes/service.js';
import * as nestingRunsService from '../../../features/nesting-runs/service.js';
import { connectDB } from '../../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { generateRandomString } from '../../../utils/strings.js';
import { requireAuth } from '../../../utils/permissions.js';
import { createStatus, inheritLineage } from '../../../core/blocks/index.js';
import { toFlexibleId } from '../../../utils/objectid.js';

const activeQueueNestLocks = new Set();

export default defineEventHandler(async (event) => {
  const queueId = event.context.params.id;
  if (activeQueueNestLocks.has(queueId)) {
    throw createError({ statusCode: 409, message: 'Queue nesting is already in progress' });
  }
  activeQueueNestLocks.add(queueId);

  try {
    requireAuth(event);
    const auth = event.context.auth;
    const userId = auth.userId;
    const body = await readBody(event);
    
    console.log('Nest request:', { queueId, userId, body });
    
    // Get queue
    const queue = await queuesService.getById(
        queueId, 
        auth.userId,
        auth.organizationId,
        auth.role,
        auth
    );
    
    if (!queue) throw createError({ statusCode: 404, message: 'Queue not found' });
    
    console.log('Queue loaded:', { 
      id: queue._id, 
      status: queue.status, 
      itemsCount: queue.data?.job?.items?.length 
    });
    
    // Guard against double-submit/race: only one active job per queue.
    const db = await connectDB();
    const existingJob = await db.collection('nesting_jobs').findOne({
      queueId: toFlexibleId(queue._id),
      status: { $in: ['pending', 'processing'] }
    });

    if (existingJob || queue.status?.state === 'NESTING') {
      throw createError({ statusCode: 400, message: 'Queue is already nesting' });
    }
    
    if (!queue.data?.job?.items || queue.data.job.items.length === 0) {
      throw createError({ statusCode: 400, message: 'Queue has no entries' });
    }
    
    // Bake parametric cassettes and prepare files list for worker
    // IMPORTANT: bake/evaluate must run sequentially because the shared
    // nodi-modular WASM engine is not safe for concurrent loadGraph/evaluate.
    const jobFiles = [];
    for (const entry of queue.data.job.items) {
      try {
        if (entry.type === 'PARAMETRIC') {
          const template = await cassetteService.getById(entry.id, auth.userId, auth.organizationId, auth.role, auth);
          console.log(`Baking parametric template: ${template.identity?.name}`);
          const bakedCassette = await bakeTemplateInstance(toFlexibleId(template._id), entry.parameters || {}, userId);
          jobFiles.push({
            cassetteId: bakedCassette._id.toString(),
            count: entry.quantity,
            dimensions: entry.parameters || {}
          });
          continue;
        }

        // Try to find as a Design first
        let item = await cassetteDesignService.getById(entry.id, auth.userId, auth.role, auth).catch(() => null);

        // If not found, try as a Template (Standard)
        if (!item) {
          item = await cassetteService.getById(entry.id, auth.userId, auth.organizationId, auth.role, auth).catch(() => null);
        }

        if (!item) {
          throw createError({ statusCode: 400, message: `Cassette item ${entry.id} not found in any collection` });
        }

        jobFiles.push({
          cassetteId: item._id.toString(),
          count: entry.quantity,
          dimensions: entry.parameters || {}
        });
      } catch (e) {
        console.error(`Error processing queue item ${entry.id}:`, e);
        throw createError({ statusCode: 400, message: `Failed to process item ${entry.id}: ${e.message}` });
      }
    }
  
  // Generate nesting slug
  const nestingSlug = `queue-${queue.data?.queueNumber ?? queue._id.toString().slice(-6)}-${generateRandomString(6)}`;
  
  // Material dimensions and pool from request
  const params = {
    height: body.virtualLength || body.height || 2440,
    width: body.virtualWidth || body.width || 1220,
    space: body.spacing || body.space || 5,
    sheetCount: 1000, // Effectively "as many as needed"
    sheet_polygon: body.sheet_polygon || null,
    inventoryItems: body.inventoryItems || []
  };
  
  // Create nesting run via service
  const runNumber = await nestingRunsService.getNextRunNumber(queue._id);
  const runOrigin = createStatus('NESTING', auth.userId, { note: `Nesting started in ${body.materialMode || 'VIRTUAL'} mode` });
  
  const run = await nestingRunsService.create({
    identity: { uid: generateRandomString(12) },
    runNumber,
    materialMode: body.materialMode || 'VIRTUAL',
    params,
    origin: runOrigin,
    status: runOrigin,
    lineage: inheritLineage(queue, 'queue'),
    requestedArtifacts: body.requestedArtifacts || ['LAYOUT_DXF']
  }, auth.userId);

  const runId = toFlexibleId(run._id);
  
  console.log('Adding nesting job to DB...');
  await db.collection('nesting_jobs').insertOne({
    slug: nestingSlug,
    projectSlug: queue.identity?.slug || '', 
    queueId: toFlexibleId(queue._id),
    runId,
    files: jobFiles, 
    params,
    status: 'pending',
    createdAt: new Date(),
    ownerId: userId
  });
  
  // Create placeholder artifacts based on request
  const requestedArtifacts = body.requestedArtifacts || ['LAYOUT_DXF'];
  const artifacts = [];

  for (const type of requestedArtifacts) {
    if (type === 'PDF_PASSPORT') {
        const art = await artifactService.create({
            type,
            queueId: toFlexibleId(queue._id),
            runId,
            name: `${queue.identity.name} - Technical Passports`,
            status: 'GENERATING',
            metadata: { templateId: body.pdfTemplateId }
        });
        artifacts.push(art);
    } else if (type === 'LAYOUT_DXF') {
        const art = await artifactService.create({
            type,
            queueId: toFlexibleId(queue._id),
            runId,
            name: `${queue.identity.name} - LAYOUT_DXF.dxf`,
            status: 'GENERATING'
        });
        artifacts.push(art);
    }
  }
  
  return {
    nestingSlug,
    status: 'NESTING',
    runId: runId.toString(),
    artifacts: artifacts.map(a => a._id || a.id)
  };
} catch (error) {
  console.error('Nesting endpoint error:', error);
  throw error;
} finally {
  activeQueueNestLocks.delete(queueId);
}
});
