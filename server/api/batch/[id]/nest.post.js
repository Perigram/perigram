/**
 * POST /api/batch/:id/nest
 * 
 * Trigger nesting for a batch
 */

import { service as batchService } from '~/server/features/batches';
import { service as cassetteService } from '~/server/features/cassettes';
import { service as artifactService } from '~/server/features/artifacts';
import { connectDB } from '~~/server/db/mongo';
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
    
    // Validate all cassettes exist
    const cassetteIds = batch.entries.map(e => e.cassetteTemplateId.toString());
    console.log('Validating cassettes:', cassetteIds);
    
    const cassettes = await Promise.all(
      cassetteIds.map(id => cassetteService.getById(id, userId))
    );
    
    console.log('Cassettes validated:', cassettes.length);
    
    // Check if any cassette is not ready (allow fallback to parametric rectangles for testing)
    for (const cassette of cassettes) {
      if (cassette.processingStatus === 'pending' || cassette.processingStatus === 'processing') {
        throw createError({ 
          statusCode: 400, 
          message: `Cassette "${cassette.name}" is still being processed (status: ${cassette.processingStatus}). Please wait.` 
        });
      }
      // Note: We allow missing polygonParts - worker will use parametric rectangles from dimensions as fallback
    }
  
  // Build file list for nesting worker
  const files = batch.entries.map((entry) => {
    return {
      cassetteId: entry.cassetteTemplateId.toString(),
      count: entry.quantity,
      dimensions: entry.dimensions || {}  // Pass dimensions (A, B, etc)
    };
  });
  
  // Generate nesting slug
  const nestingSlug = `batch-${batch.batchNumber}-${generateRandomString(6)}`;
  
  // Material dimensions from request
  const params = {
    height: body.materialHeight || body.height || 2440,
    width: body.materialWidth || body.width || 1220,
    space: body.spacing || body.space || 5,
    sheetCount: body.maxSheets || 10
  };
  
  // Create nesting job (for worker compatibility)
  const db = await connectDB();
  await db.collection('nesting_jobs').insertOne({
    slug: nestingSlug,
    projectSlug: batch.projectSlug,
    batchId: batch._id,
    files: files,  // Now contains cassetteId and count
    params,
    status: 'pending',
    createdAt: new Date(),
    ownerId: userId
  });
  
  // Update batch status
  await batchService.updateStatus(batchId, 'NESTING', userId);
  
  // Create placeholder artifacts
  const artifactTypes = ['LAYOUT_SVG', 'LAYOUT_DXF', 'PDF_PASSPORT', 'NESTING_REPORT'];
  const artifacts = await Promise.all(
    artifactTypes.map(type => 
      artifactService.create({
        type,
        batchId: batch._id,
        name: `${batch.name} - ${type}`,
        generatedBy: nestingSlug
      })
    )
  );
  
  return {
    nestingSlug,
    status: 'NESTING',
    artifacts: artifacts.map(a => a._id)
  };
} catch (error) {
  console.error('Nesting endpoint error:', error);
  throw error;
}
});
