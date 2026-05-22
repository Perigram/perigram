import { createError } from 'h3';
import { toFlexibleId } from '../../utils/objectid.js';
import * as artifactService from './service.js';
import * as nestingJobs from '../nesting/jobs.js';

export async function generateArtifact({ entities, parameters = {}, auth }) {
  const source = entities.sheetDesign || entities.nestingRun;
  if (!source) throw createError({ statusCode: 400, message: 'Artifact source entity is required' });

  const type = parameters.type;
  const sourceId = toFlexibleId(source._id);
  const lineage = {
    ...(source.lineage || {}),
    ...(entities.sheetDesign ? { sheetDesignId: sourceId } : {}),
    ...(entities.nestingRun ? { runId: sourceId } : {})
  };

  if (type === 'LAYOUT_DXF') {
    const existingDxf = entities.nestingRun ? await findGeneratedRunDxf(sourceId) : null;
    const artifact = await artifactService.create({
      type,
      lineage,
      name: `${source.identity?.name || 'Source'} - LAYOUT_DXF.dxf`,
      status: existingDxf ? 'READY' : 'GENERATING',
      fileId: existingDxf?.fileId,
      mimeType: existingDxf ? 'application/dxf' : undefined
    }, auth.userId);

    return toOperationArtifactResult(artifact);
  }

  if (type === 'PDF_PASSPORT') {
    const artifact = await artifactService.create({
      type,
      lineage,
      name: `${source.identity?.name || 'Source'} - Technical Passports`,
      status: 'GENERATING',
      metadata: { templateId: parameters.pdfTemplateId }
    }, auth.userId);

    return toOperationArtifactResult(artifact);
  }

  throw createError({ statusCode: 400, message: `Unsupported artifact type: ${type}` });
}

async function findGeneratedRunDxf(runId) {
  const job = await nestingJobs.findLatestByRun(runId);
  const fileId = job?.dxf_file_ids?.[0];
  if (!fileId || job.status !== 'done') return null;
  return { fileId };
}

function toOperationArtifactResult(artifact) {
  return {
    artifacts: [{ type: artifact.data?.type, id: (artifact._id || artifact.id).toString() }],
    data: {
      artifactId: (artifact._id || artifact.id).toString(),
      type: artifact.data?.type,
      status: artifact.status?.state || 'GENERATING'
    }
  };
}
