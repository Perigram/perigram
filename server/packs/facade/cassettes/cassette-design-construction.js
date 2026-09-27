import { createError } from 'h3';
import * as filesService from '../../../features/files/service.js';
import { instanceServiceResolver } from '../../../features/instances/service.js';
import { extractNestingPolygons, extractCurvesFromDXFLayer } from '../../../utils/dxf-extractor.js';
import { OCCS_LAYER_CUT_OUTER } from '#utils/occs/layers.js';
import { isOccsDocument } from '#utils/occs/parameters.js';
import { evaluateOccsCassetteTemplate } from '#utils/occs/evaluate.js';

// The cassette-design construction handlers (SPEC §21): the pack mount
// binds them as the type's only construction modes. All three produce a
// record with extractable geometry — construction-time means
// construction-time: nothing here re-derives later.
//
// - `bake`: OCCS template ref + parameter values -> the same pure
//   evaluator the template editor uses, applied once. Template edits
//   after construction never propagate to production pieces.
// - `upload`: a DXF payload (the upload protocol's file) with layers in
//   the canonical OCCS vocabulary — `cut.outer` carries the nesting
//   contour, everything else maps by its own layer name.
// - `convertDxf`: a `dxf-source` instance ref, same extraction as upload;
//   the source instance is referenced on the created record.

const IDENTITY_LAYERS = [OCCS_LAYER_CUT_OUTER];

function identityLayerData(fileBuffer) {
  return IDENTITY_LAYERS.flatMap(layer => extractCurvesFromDXFLayer(fileBuffer, layer).map((part, index) => ({
    layer,
    sourceLayer: layer,
    coordinates: part.coordinates,
    handles: part.handles || [],
    typeId: part.typeId,
    sourceId: `${layer}:${part.handles?.[0] || index}`
  })));
}

function extractGeometry(fileBuffer) {
  const polygonParts = extractNestingPolygons(fileBuffer, Object.fromEntries(IDENTITY_LAYERS.map(layer => [layer, layer])), OCCS_LAYER_CUT_OUTER);
  if (!polygonParts.length) {
    throw createError({
      statusCode: 400,
      message: `DXF requires at least one closed polygon on the ${OCCS_LAYER_CUT_OUTER} layer`
    });
  }
  return { polygons: polygonParts, nestingPolygons: polygonParts, layerData: identityLayerData(fileBuffer) };
}

async function payloadBufferOf(instance, label) {
  const payloadRef = instance?.attachments?.primary || null;
  if (!payloadRef?.fileId) {
    throw createError({ statusCode: 400, message: `${label} carries no DXF payload` });
  }
  // The §3 payload blob home is the `files` GridFS bucket.
  return await filesService.getFileBuffer(payloadRef.fileId, 'files');
}

async function createDesign(draft, context, data, payload) {
  const service = instanceServiceResolver('cassette-design');
  return await service.create({
    identity: { name: draft.identity?.name || null },
    data,
    lineage: draft.lineage,
    relations: draft.relations,
    ...(payload ? { payload } : {}),
    provenance: draft.provenance
  }, context.userId, context.organizationId);
}

export async function bakeCassetteDesign(draft = {}, context = {}) {
  const templateId = String(draft?.data?.template || draft?.template || '').trim();
  if (!templateId) {
    throw createError({ statusCode: 400, message: 'Cassette design bake requires a template reference' });
  }
  const parameters = draft?.data?.parameters || draft?.parameters || {};
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
    throw createError({ statusCode: 400, message: 'Cassette design bake parameters must be an object' });
  }

  const cassetteService = instanceServiceResolver('cassette');
  const template = await cassetteService.getById(templateId);
  if (!template) {
    throw createError({ statusCode: 400, message: `Cassette template ${templateId} not found` });
  }
  const organizationId = context.organizationId || null;
  const templateOrg = template.lineage?.organizationId ? String(template.lineage.organizationId) : null;
  if (organizationId && templateOrg && templateOrg !== String(organizationId)) {
    throw createError({ statusCode: 400, message: 'Cassette template belongs to another organization' });
  }

  const buffer = await payloadBufferOf(template, `Cassette template ${templateId}`);
  let definition = null;
  try {
    definition = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw createError({ statusCode: 400, message: `Cassette template ${templateId} payload is not a readable OCCS document` });
  }
  if (!isOccsDocument(definition)) {
    throw createError({ statusCode: 400, message: `Cassette template ${templateId} is not an OCCS parametric template — only OCCS templates bake` });
  }

  const evaluation = await evaluateOccsCassetteTemplate(definition, parameters, {
    templateId,
    templateName: template.identity?.name || 'Cassette template'
  });

  return await createDesign(draft, context, {
    template: String(template._id),
    parameters,
    geometry: evaluation
  });
}

export async function uploadCassetteDesign(draft = {}, context = {}) {
  const payloadRef = draft?.payload || draft?.attachments?.primary || null;
  if (!payloadRef?.fileId && !payloadRef?.id) {
    throw createError({ statusCode: 400, message: 'Cassette design upload requires a DXF file' });
  }
  const fileId = payloadRef.fileId || payloadRef.id;
  const buffer = await filesService.getFileBuffer(fileId, 'files');
  const geometry = extractGeometry(buffer);
  return await createDesign(draft, context, { geometry }, {
    fileId,
    ...(payloadRef.mime ? { mime: payloadRef.mime } : {}),
    ...(payloadRef.size != null ? { size: payloadRef.size } : {}),
    ...(payloadRef.name ? { name: payloadRef.name } : {})
  });
}

export async function convertDxfCassetteDesign(draft = {}, context = {}) {
  const sourceId = String(draft?.data?.source || draft?.source || '').trim();
  if (!sourceId) {
    throw createError({ statusCode: 400, message: 'Cassette design conversion requires a dxf-source reference' });
  }
  const dxfSourceService = instanceServiceResolver('dxf-source');
  const source = await dxfSourceService.getById(sourceId);
  if (!source) {
    throw createError({ statusCode: 400, message: `DXF source ${sourceId} not found` });
  }
  const organizationId = context.organizationId || null;
  const sourceOrg = source.lineage?.organizationId ? String(source.lineage.organizationId) : null;
  if (organizationId && sourceOrg && sourceOrg !== String(organizationId)) {
    throw createError({ statusCode: 400, message: 'DXF source belongs to another organization' });
  }

  const buffer = await payloadBufferOf(source, `DXF source ${sourceId}`);
  const geometry = extractGeometry(buffer);
  return await createDesign(draft, context, {
    source: String(source._id),
    geometry
  });
}
