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
  const userId = event.context.auth.userId;
  const batchId = getRouterParam(event, 'id');
  const body = await readBody(event);
  
  // Get batch
  const batch = await batchService.getById(batchId, userId);
  
  if (batch.status === 'NESTING') {
    throw createError({ statusCode: 400, message: 'Batch is already nesting' });
  }
  
  // Validate all cassettes exist
  const cassetteIds = batch.entries.map(e => e.cassetteTemplateId.toString());
  const cassettes = await Promise.all(
    cassetteIds.map(id => cassetteService.getById(id, userId))
  );
  
  // Build file list for nesting worker
  const files = batch.entries.map((entry, index) => {
    const cassette = cassettes[index];
    return {
      slug: cassette.dxfId || cassette.slug,
      name: cassette.name,
      count: entry.quantity
    };
  });
  
  // Generate nesting slug
  const nestingSlug = `batch-${batch.batchNumber}-${generateRandomString(6)}`;
  
  // Material dimensions from request
  const params = {
    height: body.materialHeight || 2440,
    width: body.materialWidth || 1220,
    space: body.spacing || 5,
    sheetCount: body.maxSheets || 10
  };
  
  // Create nesting job (for worker compatibility)
  const db = await connectDB();
  await db.collection('nesting_jobs').insertOne({
    slug: nestingSlug,
    projectSlug: batch.projectSlug,
    batchId: batch._id,
    files: files.map(f => ({
      slug: f.slug,
      simpleName: f.name.replace('.dxf', ''),
      count: f.count
    })),
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
});
