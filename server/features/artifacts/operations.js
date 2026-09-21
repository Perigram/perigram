import { createError } from 'h3';
import { toFlexibleId } from '../../utils/objectid.js';
import * as attachmentService from './service.js';
import * as nestingJobs from '../nesting/jobs.js';
import * as sheetDesignsService from '../sheet-designs/service.js';
import * as artifactTemplatesService from '../artifact-templates/service.js';
import { createEntityRef, createProvenance } from '../../core/blocks/index.js';

export async function generateAttachment({ entities, parameters = {}, auth }) {
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
        derivedFrom: createProvenance(createEntityRef(sourceType, sourceId)),
        template: createProvenance(createEntityRef('artifact_template', templateId, rendered.revisionId), {
          variables: rendered.variables
        })
      }
    }, auth);
    return toCommandAttachmentResult(attachment);
  }

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

async function findGeneratedRunDxf(runId) {
  const job = await nestingJobs.findLatestByRun(runId);
  const fileId = job?.dxf_file_ids?.[0];
  if (!fileId || job.status !== 'done') return null;
  return { fileId };
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
