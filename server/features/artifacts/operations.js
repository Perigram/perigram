import { createError } from 'h3';
import { toFlexibleId } from '../../utils/objectid.js';
import * as attachmentService from './service.js';
import * as nestingJobs from '../nesting/jobs.js';

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
    const existingDxf = entities.nestingRun ? await findGeneratedRunDxf(sourceId) : null;
    const attachment = await attachmentService.create({
      type: kind,
      lineage,
      name: `${source.identity?.name || 'Source'} - LAYOUT_DXF.dxf`,
      status: existingDxf ? 'READY' : 'GENERATING',
      fileId: existingDxf?.fileId,
      mimeType: existingDxf ? 'application/dxf' : undefined
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
  return {
    attachments: [{ kind: attachment.data?.type, id: (attachment._id || attachment.id).toString() }],
    data: {
      attachmentId: (attachment._id || attachment.id).toString(),
      kind: attachment.data?.type,
      status: attachment.status?.state || 'GENERATING'
    }
  };
}
