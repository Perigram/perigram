/**
 * POST /api/queue/:id/nest
 * 
 * Trigger nesting for a queue
 */

import * as queuesService from '~/server/features/queues/service';
import { service as cassetteService } from '~/server/features/cassettes';
import { service as artifactService } from '~/server/features/artifacts';
import { bakeTemplateInstance } from '~/server/features/parametric-cassettes/service';
import { connectDB } from '~~/server/db/mongo';
import { ObjectId } from 'mongodb';
import { generateRandomString } from '~~/server/utils/strings';
import { requireAuth } from '~/server/utils/permissions';

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
      entriesCount: queue.entries?.length 
    });
    
    if (queue.status === 'NESTING') {
      // Check if there's actually a nesting job in progress
      const db = await connectDB();
      const existingJob = await db.collection('nesting_jobs').findOne({
        queueId: queue._id, // Updated to queueId
        status: { $in: ['pending', 'processing'] }
      });
      
      if (existingJob) {
        throw createError({ statusCode: 400, message: 'Queue is already nesting' });
      } else {
        // No active job found, allow re-nesting (previous attempt failed)
        console.log('No active nesting job found, allowing re-nest');
      }
    }
    
    // Check queue has entries
    if (!queue.entries || queue.entries.length === 0) {
      throw createError({ statusCode: 400, message: 'Queue has no entries' });
    }
    
    // Validate all cassettes exist and bake parametric ones
    const cassetteIds = queue.entries.map(e => e.cassetteTemplateId.toString());
    console.log('Validating cassettes:', cassetteIds);
    
    const cassettes = await Promise.all(
      cassetteIds.map(id => cassetteService.getById(id, userId))
    );
    
    console.log('Cassettes validated:', cassettes.length);
    
    // Bake parametric cassettes and prepare files list for worker
    // Each baked entry becomes a unique "cassette" document for the worker
    const jobFiles = await Promise.all(
      queue.entries.map(async (entry) => {
        const template = cassettes.find(c => c._id.toString() === entry.cassetteTemplateId.toString());
        
        if (template.type === 'PARAMETRIC') {
          console.log(`Baking parametric template: ${template.name} for queue entry`);
          const bakedCassette = await bakeTemplateInstance(template._id, entry.dimensions || {}, userId);
          console.log(`Baked cassette created with ID: ${bakedCassette._id}`);
          return {
            cassetteId: bakedCassette._id.toString(),
            count: entry.quantity,
            dimensions: entry.dimensions || {}
          };
        } else {
          return {
            cassetteId: template._id.toString(),
            count: entry.quantity,
            dimensions: entry.dimensions || {}
          };
        }
      })
    );
  
  // Generate nesting slug
  const nestingSlug = `queue-${queue.queueNumber}-${generateRandomString(6)}`;
  
  // Material dimensions and pool from request
  const params = {
    height: body.materialHeight || body.height || 2440,
    width: body.materialWidth || body.width || 1220,
    space: body.spacing || body.space || 5,
    sheetCount: body.maxSheets || 10,
    sheet_polygon: body.sheet_polygon || null,
    inventorySheets: body.inventorySheets || []
  };
  
  // Create nesting job
  const db = await connectDB();
  const runId = new ObjectId();
  
  const runNumber = (queue.runs?.length || 0) + 1;
  
  await queuesService.addRun(
      queueId, 
      { 
        _id: runId, 
        status: 'NESTING',
        runNumber,
        requestedArtifacts: body.requestedArtifacts || ['LAYOUT_DXF']
      },
      auth.userId,
      auth.organizationId,
      auth.role,
      auth
  );
  
  await db.collection('nesting_jobs').insertOne({
    slug: nestingSlug,
    projectSlug: queue.projectSlug,
    queueId: queue._id, // Updated field
    runId,
    files: jobFiles, 
    params,
    status: 'pending',
    createdAt: new Date(),
    ownerId: userId
  });
  
  await queuesService.setRunsStatusByStatus(
      queueId, 
      'NESTING', 
      'ERROR', 
      auth.userId,
      auth.organizationId,
      auth.role,
      auth
  );
  
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
