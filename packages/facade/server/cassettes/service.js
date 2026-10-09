// Cassette pack operations over the generic §13 instance service: CRUD,
// tenancy, payload storage, and the geometry revision chain are the
// generic machinery's job (records live in the `files` per-class
// collection; the OCCS/DXF document rides the payload). What stays here
// is the pack's domain semantics: the STANDARD DXF import (artifact →
// extracted geometry) and the template DXF export (payload evaluation or
// stored layers → DXF).
import { createError } from 'h3';
import * as artifactsService from '../../../../server/features/artifacts/service.js';
import * as filesService from '../../../../server/features/files/service.js';
import { instanceServiceResolver } from '../../../../server/features/instances/service.js';
import { extractNestingPolygons, extractCurvesFromDXFLayer } from '../../../../server/utils/dxf-extractor.js';
import { OCCS_LAYER_CUT_OUTER } from '../../../../utils/occs/layers.js';

function buildMappedLayerData(fileBuffer, layerMapping = {}) {
  return Object.entries(layerMapping).flatMap(([sourceLayer, layer]) => {
    if (!layer) return [];
    return extractCurvesFromDXFLayer(fileBuffer, sourceLayer).map((part, index) => ({
      layer,
      sourceLayer,
      coordinates: part.coordinates,
      handles: part.handles || [],
      typeId: part.typeId,
      sourceId: `${sourceLayer}:${part.handles?.[0] || index}`
    }));
  });
}

const cassetteService = () => instanceServiceResolver('cassette');

// The PARAMETRIC template's OCCS document — the payload is the one home.
export async function cassetteDefinition(cassette) {
  const payloadRef = cassette?.attachments?.primary || cassette?.payload || null;
  const fileId = payloadRef?.fileId || payloadRef?.id || null;
  if (!fileId) return null;
  let definition = null;
  try {
    definition = JSON.parse((await filesService.getFileBuffer(fileId, 'files')).toString('utf8'));
  } catch {
    return null;
  }
  return definition && typeof definition === 'object' ? definition : null;
}

// STANDARD import: a DXF_SOURCE artifact's payload is extracted once —
// the cut contour and mapped semantic layers become the template's
// stored geometry fields, the DXF itself becomes the payload.
export async function importFromArtifact(artifactId, name, auth, mapping = {}, parameters = []) {
  const artifact = await artifactsService.getById(
    artifactId, auth.userId, auth.organizationId, auth.role, auth
  );
  if (artifact.data?.type !== 'DXF_SOURCE' || !artifact.attachments?.primary?.fileId) {
    throw createError({ statusCode: 400, message: 'Cassette import requires a DXF_SOURCE artifact with a file' });
  }
  const attachment = artifact.attachments.primary;
  const bucketName = attachment.metadata?.bucketName || attachment.bucketName || 'userDxf';
  const fileBuffer = await filesService.getFileBuffer(attachment.fileId, bucketName);
  const layerMapping = mapping || {};
  const polygonParts = extractNestingPolygons(fileBuffer, layerMapping, OCCS_LAYER_CUT_OUTER);
  if (!polygonParts.length) {
    throw createError({
      statusCode: 400,
      message: `DXF upload requires at least one closed polygon mapped to ${OCCS_LAYER_CUT_OUTER}`
    });
  }
  const layerData = buildMappedLayerData(fileBuffer, layerMapping);

  const stored = await filesService.uploadFile(
    fileBuffer, attachment.name || artifact.identity?.name || 'cassette.dxf', {
      userId: auth.userId, organizationId: auth.organizationId, type: 'cassette'
    }, 'files'
  );

  return await cassetteService().create({
    identity: { name: name || artifact.identity?.name || 'Cassette' },
    payload: { fileId: stored.id, mime: 'application/dxf', size: fileBuffer.length },
    data: {
      templateType: 'STANDARD',
      mapping: layerMapping,
      parameters: parameters || [],
      polygonParts,
      layerData
    },
    provenance: {
      op: 'artifact-conversion',
      sources: [{ type: 'artifact', id: String(artifact._id) }],
      effective: { mapping: layerMapping }
    }
  }, auth.userId, auth.organizationId);
}

// Template DXF export: PARAMETRIC templates evaluate their OCCS payload
// once (the serial evaluation lock lives in evaluation.js); STANDARD
// templates export their stored layers.
export async function exportDxf(id, dimensions = {}, auth = null) {
  const template = await cassetteService().getById(id);
  if (!template) throw createError({ statusCode: 404, message: 'Template not found' });

  if (template.data?.templateType === 'PARAMETRIC') {
    const { evaluateTemplate, generateSimpleDxf } = await import('./evaluation.js');
    const { polygons, nestingPolygons, layerData } = await evaluateTemplate(id, dimensions || {});
    return layerData?.length
      ? layeredDxf({ layerData, polygonParts: nestingPolygons?.length ? nestingPolygons : polygons })
      : generateSimpleDxf(polygons);
  }

  const layerData = Array.isArray(template.data?.layerData) ? template.data.layerData : [];
  const polygonParts = Array.isArray(template.data?.polygonParts) ? template.data.polygonParts : [];
  if (!layerData.length && !polygonParts.length) {
    throw createError({ statusCode: 404, message: 'DXF not found for this template' });
  }
  return layeredDxf({ layerData, polygonParts });
}

async function layeredDxf({ layerData, polygonParts }) {
  const { generateLayeredDxf } = await import('../../../../server/utils/dxf-writer.js');
  return generateLayeredDxf({ layerData, polygonParts });
}
