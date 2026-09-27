import { createError } from 'h3';
import { toFlexibleId } from '../../utils/objectid.js';
import * as attachmentService from './service.js';
import * as artifactTemplatesService from '../artifact-templates/service.js';
import { createInstanceRef, createProvenance } from '../../core/blocks/index.js';

// The pack seam: sheet-design DXF export is facade-domain behavior, so
// the framework handler receives it as an injected executor (the facade
// pack mounts the override). Without a pack executor the sheet-design
// LAYOUT_DXF branch refuses honestly instead of importing domain code.
export async function generateAttachment({ entities, parameters = {}, auth }, { sheetDxfExporter = null } = {}) {
  const source = entities.source || entities.sheetDesign || entities.nestingRun;
  if (!source) throw createError({ statusCode: 400, message: 'Attachment source entity is required' });

  const kind = parameters.kind || parameters.type;
  const sourceId = toFlexibleId(source._id);
  const sourceType = source.type || source.typeId || source.origin?.type || source.data?.type;
  const isSheetDesign = Boolean(entities.sheetDesign || sourceType === 'sheet_design');
  const isNestingRun = Boolean(entities.nestingRun || sourceType === 'nesting_run');
  const lineage = {
    ...(source.lineage || {}),
    ...(isSheetDesign ? { sheetDesignId: sourceId } : {}),
    ...(isNestingRun ? { runId: sourceId } : {})
  };

  if (entities.template) {
    const templateId = entities.template._id || entities.template.identity?.uid;
    const rendered = await artifactTemplatesService.render(templateId, { values: parameters.values || {} }, auth);
    const expectedKind = rendered.format === 'PDF' ? 'PDF_PASSPORT' : 'LAYOUT_DXF';
    if (kind !== expectedKind) {
      throw createError({ statusCode: 400, message: `${rendered.format} templates generate ${expectedKind} artifacts` });
    }
    const attachment = await attachmentService.createRendered({
      buffer: rendered.buffer,
      filename: `${source.identity?.name || 'Source'} - ${expectedKind}.${rendered.extension}`,
      mimeType: rendered.mimeType,
      type: expectedKind,
      lineage,
      layout: rendered.layout,
      values: parameters.values || {},
      metadata: { templateRevisionId: rendered.revisionId },
      provenance: {
        derivedFrom: createProvenance(createInstanceRef(sourceType, sourceId)),
        template: createProvenance(createInstanceRef('artifact_template', templateId, rendered.revisionId), {
          variables: rendered.variables
        })
      }
    }, auth);
    return toCommandAttachmentResult(attachment);
  }

  if (kind === 'LAYOUT_DXF') {
    let generatedDxf = null;
    if (isSheetDesign) {
      if (typeof sheetDxfExporter !== 'function') {
        throw createError({ statusCode: 400, message: 'Sheet-design DXF export requires the facade pack (no sheetDxf executor mounted)' });
      }
      generatedDxf = await sheetDxfExporter(sourceId, auth);
    }
    const existingDxf = isNestingRun ? await findGeneratedRunDxf(sourceId) : null;
    const dxfFile = generatedDxf || existingDxf;
    const attachment = await attachmentService.create({
      type: kind,
      lineage,
      name: `${source.identity?.name || 'Source'} - LAYOUT_DXF.dxf`,
      fileId: dxfFile?.fileId,
      mimeType: dxfFile ? 'application/dxf' : undefined
    }, auth.userId, auth.organizationId, auth.role, auth);

    return toCommandAttachmentResult(attachment);
  }

  if (kind === 'PDF_PASSPORT') {
    throw createError({ statusCode: 400, message: 'PDF_PASSPORT generation requires an artifact template' });
  }

  throw createError({ statusCode: 400, message: `Unsupported attachment kind: ${kind}` });
}

// Nesting-run DXF lookup died with the legacy nesting pipeline: runs no
// longer carry generated DXF jobs to attach.
async function findGeneratedRunDxf() {
  return null;
}

function toCommandAttachmentResult(attachment) {
  const id = (attachment._id || attachment.id).toString();
  const kind = attachment.data?.type;
  const completed = Boolean(attachment.attachments?.primary?.fileId);
  return {
    attachments: [{ kind, id }],
    events: [{
      type: completed ? 'attachment.generationCompleted' : 'attachment.generationQueued',
      source: { type: 'artifact', id },
      data: { kind, completed }
    }],
    data: {
      attachmentId: id,
      kind,
      completed
    }
  };
}
