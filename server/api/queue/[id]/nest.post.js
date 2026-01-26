/**
 * POST /api/queue/:id/nest
 * 
 * Trigger nesting for a queue
 */

import * as queuesService from '~/server/features/queues/service';
import * as cassetteService from '~/server/features/cassettes/service';
import * as cassetteDesignService from '~/server/features/cassette-designs/service';
import { service as artifactService } from '~/server/features/artifacts';
import { bakeTemplateInstance } from '~/server/features/parametric-cassettes/service';
import { connectDB } from '~~/server/db/mongo';
import { ObjectId } from 'mongodb';
import { generateRandomString } from '~~/server/utils/strings';
import { requireAuth } from '~/server/utils/permissions';
import { createStatus } from '~/server/utils/blocks';

export default defineEventHandler(async (event) => {
  try {
    requireAuth(event);
    const auth = event.context.auth;
    const userId = auth.userId;
    const queueId = event.context.params.id;
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
    
    console.log('Queue loaded:', { 
      id: queue._id, 
      status: queue.status, 
      itemsCount: queue.job?.items?.length 
    });
    
    if (queue.status === 'NESTING') {
      const db = await connectDB();
      const existingJob = await db.collection('nesting_jobs').findOne({
        queueId: queue._id,
        status: { $in: ['pending', 'processing'] }
      });
      
      if (existingJob) {
        throw createError({ statusCode: 400, message: 'Queue is already nesting' });
      }
    }
    
    if (!queue.job?.items || queue.job.items.length === 0) {
      throw createError({ statusCode: 400, message: 'Queue has no entries' });
    }
    
    // Bake parametric cassettes and prepare files list for worker
    const jobFiles = await Promise.all(
      queue.job.items.map(async (entry) => {
        try {
          if (entry.type === 'PARAMETRIC') {
            const template = await cassetteService.getById(entry.id, auth.userId, auth.organizationId, auth.role, auth);
            console.log(`Baking parametric template: ${template.identity?.name || template.name}`);
            const bakedCassette = await bakeTemplateInstance(template._id, entry.parameters || {}, userId);
            return {
              cassetteId: bakedCassette._id.toString(),
              count: entry.quantity,
              dimensions: entry.parameters || {}
            };
          } else {
            // Try to find as a Design first
            let item = await cassetteDesignService.getById(entry.id, auth.userId, auth.role, auth).catch(() => null);
            
            // If not found, try as a Template (Standard)
            if (!item) {
              item = await cassetteService.getById(entry.id, auth.userId, auth.organizationId, auth.role, auth).catch(() => null);
            }

            if (!item) {
              throw createError({ statusCode: 400, message: `Cassette item ${entry.id} not found in any collection` });
            }

            return {
              cassetteId: item._id.toString(),
              count: entry.quantity,
              dimensions: entry.parameters || {}
            };
          }
        } catch (e) {
          console.error(`Error processing queue item ${entry.id}:`, e);
          throw createError({ statusCode: 400, message: `Failed to process item ${entry.id}: ${e.message}` });
        }
      })
    );
  
  // Generate nesting slug
  const nestingSlug = `queue-${queue.queueNumber}-${generateRandomString(6)}`;
  
  // Material dimensions and pool from request
  const params = {
    height: body.virtualLength || body.height || 2440,
    width: body.virtualWidth || body.width || 1220,
    space: body.spacing || body.space || 5,
    sheetCount: 1000, // Effectively "as many as needed"
    sheet_polygon: body.sheet_polygon || null,
    inventoryItems: body.inventoryItems || []
  };
  
  // Create nesting job
  const db = await connectDB();
  const runId = new ObjectId();
  
  const runNumber = (queue.runs?.length || 0) + 1;
  
  // 1. Clear previous nesting runs (mark them as ERROR if they were stuck)
  await queuesService.setRunsStatusByStatus(
      queueId, 
      'NESTING', 
      'ERROR', 
      auth.userId,
      auth.organizationId,
      auth.role,
      auth
  );

  // 2. Add new run
  const runOrigin = createStatus('NESTING', auth.userId, { note: `Nesting started in ${body.materialMode || 'VIRTUAL'} mode` });

  await queuesService.addRun(
      queueId, 
      { 
        _id: runId, 
        status: runOrigin,
        runNumber,
        materialMode: body.materialMode || 'VIRTUAL',
        origin: runOrigin,
        requestedArtifacts: body.requestedArtifacts || ['LAYOUT_DXF'],
        createdAt: new Date()
      },
      auth.userId,
      auth.organizationId,
      auth.role,
      auth
  );
  
  console.log('Adding nesting job to DB...');
  await db.collection('nesting_jobs').insertOne({
    slug: nestingSlug,
    projectSlug: queue.identity?.slug || '', // Use identity.slug if exists
    queueId: queue._id,
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
            queueId: queue._id,
            runId,
            name: `${queue.name} - Technical Passports`,
            generatedBy: nestingSlug,
            status: 'GENERATING',
            metadata: { templateId: body.pdfTemplateId }
        });
        artifacts.push(art);
    } else if (type === 'LAYOUT_DXF') {
        const art = await artifactService.create({
            type,
            queueId: queue._id,
            runId,
            name: `${queue.name} - LAYOUT_DXF.dxf`,
            generatedBy: nestingSlug,
            status: 'GENERATING'
        });
        artifacts.push(art);
    }
  }
  
  return {
    nestingSlug,
    status: 'NESTING',
    runId: runId.toString(),
    artifacts: artifacts.map(a => a._id)
  };
} catch (error) {
  console.error('Nesting endpoint error:', error);
  throw error;
}
});
