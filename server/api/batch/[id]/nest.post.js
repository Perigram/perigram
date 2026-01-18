/**
 * POST /api/batch/:id/nest
 * 
 * Trigger nesting for a batch
 */

import { service as batchService } from '~/server/features/batches';
import { service as cassetteService } from '~/server/features/cassettes';
import { service as artifactService } from '~/server/features/artifacts';
import { bakeTemplateInstance } from '~/server/features/parametric-cassettes/service';
import { connectDB } from '~~/server/db/mongo';
import { ObjectId } from 'mongodb';
import { generateRandomString } from '~~/server/utils/strings';
import standardSlugify from 'standard-slugify';

export default defineEventHandler(async (event) => {
  try {
    const userId = event.context.auth.userId;
    const batchId = getRouterParam(event, 'id');
    const body = await readBody(event);
    
    console.log('Nest request:', { batchId, userId, body });
    
    // Get batch
    const batch = await batchService.getById(batchId, userId);
    
    console.log('Batch loaded:', { 
      id: batch._id, 
      status: batch.status, 
      entriesCount: batch.entries?.length 
    });
    
    if (batch.status === 'NESTING') {
      // Check if there's actually a nesting job in progress
      const db = await connectDB();
      const existingJob = await db.collection('nesting_jobs').findOne({
        batchId: batch._id,
        status: { $in: ['pending', 'processing'] }
      });
      
      if (existingJob) {
        throw createError({ statusCode: 400, message: 'Batch is already nesting' });
      } else {
        // No active job found, allow re-nesting (previous attempt failed)
        console.log('No active nesting job found, allowing re-nest');
      }
    }
    
    // Check batch has entries
    if (!batch.entries || batch.entries.length === 0) {
      throw createError({ statusCode: 400, message: 'Batch has no entries' });
    }
    
    // Validate all cassettes exist and bake parametric ones
    const cassetteIds = batch.entries.map(e => e.cassetteTemplateId.toString());
    console.log('Validating cassettes:', cassetteIds);
    
    const cassettes = await Promise.all(
      cassetteIds.map(id => cassetteService.getById(id, userId))
    );
    
    console.log('Cassettes validated:', cassettes.length);
    
    // Bake parametric cassettes and prepare files list for worker
    // Each baked entry becomes a unique "cassette" document for the worker
    const jobFiles = await Promise.all(
      batch.entries.map(async (entry) => {
        const template = cassettes.find(c => c._id.toString() === entry.cassetteTemplateId.toString());
        
        if (template.type === 'PARAMETRIC') {
          console.log(`Baking parametric template: ${template.name} for batch entry`);
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
  const nestingSlug = `batch-${batch.batchNumber}-${generateRandomString(6)}`;
  
  // Material dimensions from request
  const params = {
    height: body.materialHeight || body.height || 2440,
    width: body.materialWidth || body.width || 1220,
    space: body.spacing || body.space || 5,
    sheetCount: body.maxSheets || 10
  };
  
  // Create nesting job (generic schema, works for both standard and baked)
  const db = await connectDB();
  const runId = new ObjectId();
  await batchService.addRun(batchId, { _id: runId, status: 'NESTING' }, userId);
  await db.collection('nesting_jobs').insertOne({
    slug: nestingSlug,
    projectSlug: batch.projectSlug,
    batchId: batch._id,
    runId,
    files: jobFiles, 
    params,
    status: 'pending',
    createdAt: new Date(),
    ownerId: userId
  });
  
  // Update batch status - set previous NESTING runs to ERROR and delete their artifacts
  const errorRuns = batch.runs?.filter(r => r.status === 'NESTING') || [];
  for (const errorRun of errorRuns) {
    // Delete artifacts for this error run
    await db.collection('artifacts').deleteMany({
      batchId: batch._id,
      runId: errorRun._id
    });
  }
  await batchService.setRunsStatusByStatus(batchId, 'NESTING', 'ERROR', userId);
  
  // Create placeholder artifacts
  const artifactTypes = ['LAYOUT_SVG', 'LAYOUT_DXF', 'PDF_PASSPORT', 'NESTING_REPORT'];
  const artifacts = await Promise.all(
    artifactTypes.map(type => 
      artifactService.create({
        type,
        batchId: batch._id,
        runId,
        name: `${batch.name} - ${type}`,
        generatedBy: nestingSlug
      })
    )
  );
  
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
