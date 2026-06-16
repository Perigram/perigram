import { createError } from 'h3';
import { toFlexibleId } from '../../utils/objectid.js';
import * as attachmentService from './service.js';
import * as nestingJobs from '../nesting/jobs.js';
import * as sheetDesignsService from '../sheet-designs/service.js';

export async function generateAttachment({ entities, parameters = {}, auth }) {
  const source = entities.sheetDesign || entities.nestingRun;
  if (!source) throw createError({ statusCode: 400, message: 'Attachment source entity is required' });

  const kind = parameters.kind || parameters.type;
  const sourceId = toFlexibleId(source._id);
  const lineage = {
    ...(source.lineage || {}),
    ...(entities.sheetDesign ? { sheetDesignId: sourceId } : {}),
    ...(entities.nestingRun ? { runId: sourceId } : {})
  };

  if (kind === 'LAYOUT_DXF') {
    const generatedDxf = entities.sheetDesign
      ? await sheetDesignsService.generateAndStoreDxf(sourceId, auth.userId, auth.organizationId, auth.role, auth)
      : null;
    const existingDxf = entities.nestingRun ? await findGeneratedRunDxf(sourceId) : null;
    const dxfFile = generatedDxf || existingDxf;
    const attachment = await attachmentService.create({
      type: kind,
      lineage,
      name: `${source.identity?.name || 'Source'} - LAYOUT_DXF.dxf`,
      status: dxfFile ? 'READY' : 'GENERATING',
      fileId: dxfFile?.fileId,
      mimeType: dxfFile ? 'application/dxf' : undefined
    }, auth.userId);

    return toCommandAttachmentResult(attachment);
  }

  if (kind === 'PDF_PASSPORT') {
    const attachment = await attachmentService.create({
      type: kind,
      lineage,
      name: `${source.identity?.name || 'Source'} - Technical Passports`,
      status: 'GENERATING',
      metadata: { templateId: parameters.pdfTemplateId }
    }, auth.userId);

    return toCommandAttachmentResult(attachment);
  }

  throw createError({ statusCode: 400, message: `Unsupported attachment kind: ${kind}` });
}

async function findGeneratedRunDxf(runId) {
  const job = await nestingJobs.findLatestByRun(runId);
  const fileId = job?.dxf_file_ids?.[0];
  if (!fileId || job.status !== 'done') return null;
  return { fileId };
}

function toCommandAttachmentResult(attachment) {
  const id = (attachment._id || attachment.id).toString();
  const kind = attachment.data?.type;
  const status = attachment.status?.state || 'GENERATING';
  return {
    attachments: [{ kind, id }],
    events: [{
      type: status === 'READY' ? 'attachment.generationCompleted' : 'attachment.generationQueued',
      source: { type: 'artifact', id },
      data: { kind, status }
    }],
    data: {
      attachmentId: id,
      kind,
      status
    }
  };
}
