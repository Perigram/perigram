import { createError } from 'h3';
import { toFlexibleId } from '../../utils/objectid.js';
import * as attachmentService from './service.js';
import * as sheetDesignsService from '../sheet-designs/service.js';
import { getPrimaryState } from '~/server/core/blocks/index.js';

export async function generateAttachment({ entities, parameters = {}, auth }) {
  const source = entities.source || entities.sheetDesign;
  if (!source) throw createError({ statusCode: 400, message: 'Sheet design source is required' });

  const kind = parameters.kind || parameters.type;
  const sourceId = toFlexibleId(source._id);
  const lineage = {
    ...(source.lineage || {}),
    sheetDesign: {
      entityType: 'sheet_design',
      entityId: sourceId.toString(),
      ...(source.data?.revisions?.geometry?.currentId
        ? { revisionId: source.data.revisions.geometry.currentId.toString() }
        : {})
    }
  };

  if (kind === 'LAYOUT_DXF') {
    const dxfFile = await sheetDesignsService.generateAndStoreDxf(sourceId, auth.userId, auth.organizationId, auth.role, auth);
    const attachment = await attachmentService.create({
      type: kind,
      lineage,
      source: lineage.sheetDesign,
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
      source: lineage.sheetDesign,
      name: `${source.identity?.name || 'Source'} - Technical Passports`,
      status: 'GENERATING',
      metadata: { templateId: parameters.pdfTemplateId }
    }, auth.userId, auth.organizationId, auth.role, auth);

    return toCommandAttachmentResult(attachment);
  }

  throw createError({ statusCode: 400, message: `Unsupported attachment kind: ${kind}` });
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
