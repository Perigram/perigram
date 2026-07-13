import { createError } from 'h3';
import { toFlexibleId } from '../../utils/objectid.js';
import * as attachmentService from './service.js';
import * as nestingJobs from '../nesting/jobs.js';
import * as sheetDesignsService from '../sheet-designs/service.js';
import { getPrimaryState } from '~/server/core/blocks/index.js';

export async function generateAttachment({ entities, parameters = {}, auth }) {
  const source = entities.source || entities.sheetDesign || entities.nestingRun;
  if (!source) throw createError({ statusCode: 400, message: 'Attachment source entity is required' });

  const kind = parameters.kind || parameters.type;
  const sourceId = toFlexibleId(source._id);
  const sourceType = source.type || source.entityType || source.origin?.type || source.data?.type;
  const isSheetDesign = Boolean(entities.sheetDesign || sourceType === 'sheet_design');
  const isNestingRun = Boolean(entities.nestingRun || sourceType === 'nesting_run');
  const lineage = {
    ...(source.lineage || {}),
    ...(isSheetDesign ? { sheetDesignId: sourceId } : {}),
    ...(isNestingRun ? { runId: sourceId } : {})
  };

  if (kind === 'LAYOUT_DXF') {
    const generatedDxf = isSheetDesign
      ? await sheetDesignsService.generateAndStoreDxf(sourceId, auth.userId, auth.organizationId, auth.role, auth)
      : null;
    const existingDxf = isNestingRun ? await findGeneratedRunDxf(sourceId) : null;
    const dxfFile = generatedDxf || existingDxf;
    const attachment = await attachmentService.create({
      type: kind,
      lineage,
      name: `${source.identity?.name || 'Source'} - LAYOUT_DXF.dxf`,
      status: dxfFile ? 'READY' : 'GENERATING',
      fileId: dxfFile?.fileId,
      mimeType: dxfFile ? 'application/dxf' : undefined
    }, auth.userId, auth.organizationId, auth.role, auth);

    return toCommandAttachmentResult(attachment);
  }

  if (kind === 'PDF_PASSPORT') {
    const attachment = await attachmentService.create({
      type: kind,
      lineage,
      name: `${source.identity?.name || 'Source'} - Technical Passports`,
      status: 'GENERATING',
      metadata: { templateId: parameters.pdfTemplateId }
    }, auth.userId, auth.organizationId, auth.role, auth);

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
  const status = getPrimaryState(attachment.status, 'GENERATING');
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
