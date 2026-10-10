import { createError } from 'h3';
import { toFlexibleId } from '../../utils/objectid.js';
import * as attachmentService from './service.js';
import * as artifactTemplatesService from '../artifact-templates/service.js';
import { createInstanceRef, createProvenance } from '../../core/blocks/index.js';
import * as filesService from '../files/service.js';
import { instanceServiceResolver } from '../instances/service.js';
import { executeConnectorService, exportersForOrganization } from '../plugins/service.js';

// The export seam: sheet-design DXF export is plugin-domain behavior — the
// organization's installed plugin declares the export binding (typeId +
// kind + service). Without an install the sheet-design LAYOUT_DXF branch
// refuses honestly instead of importing domain code.
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
      const exporter = await resolvePluginExporter(sourceType, 'LAYOUT_DXF', auth);
      if (!exporter) {
        throw createError({ statusCode: 400, message: 'Sheet-design DXF export requires an installed plugin export binding' });
      }
      generatedDxf = await exporter(sourceId, auth);
    }
    const dxfFile = generatedDxf;
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

// The installed plugin's export executor for a source type: reads the
// instance's stored geometry VALUES, calls the bound plugin service, and
// stores the returned file. Returns null when no install binds one.
async function resolvePluginExporter(sourceType, kind, auth) {
  const organizationId = auth?.organizationId || auth?.memberships?.[0]?.organizationId || null;
  if (!organizationId) return null;
  const exporters = await exportersForOrganization(organizationId).catch(() => []);
  const binding = exporters.find(entry =>
    entry.kind === kind && [entry.typeId, entry.typeId?.replace('-', '_')].includes(sourceType)
  ) || exporters.find(entry => entry.kind === kind) || null;
  if (!binding) return null;
  return async (sourceId, executorAuth) => {
    const service = instanceServiceResolver(binding.typeId);
    const instance = await service.getById(sourceId);
    if (!instance) throw createError({ statusCode: 404, message: `Export source ${sourceId} not found` });
    const output = await executeConnectorService(
      { id: binding.service },
      {
        parameters: {
          typeId: binding.typeId,
          id: String(sourceId),
          name: instance.identity?.name || null,
          data: instance.data || {},
          specs: instance.specs || {}
        },
        auth: executorAuth
      }
    );
    const dxf = output && typeof output.dxf === 'string' ? output.dxf : null;
    if (!dxf) {
      throw createError({ statusCode: 502, message: `Export service ${binding.service} returned no dxf` });
    }
    const filename = `${instance.identity?.slug || sourceId}.dxf`;
    const uploaded = await filesService.uploadFile(
      Buffer.from(dxf, 'utf8'),
      filename,
      {
        userId: executorAuth.userId,
        organizationId: executorAuth.organizationId || organizationId,
        sheetDesignId: String(sourceId),
        type: 'LAYOUT_DXF'
      },
      'nestDxf'
    );
    return { fileId: uploaded.id, dxf };
  };
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
