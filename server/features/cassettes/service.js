import * as repository from './repository.js';
import * as cassetteDesignService from '../cassette-designs/service.js';
import * as entityRevisionsService from '../entity-revisions/service.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '../../utils/permissions.js';
import {
  createIdentity,
  createStatus,
  createData
} from '../../core/blocks/index.js';
import { createTransitionAuth, statusService } from '../../core/machines/service.js';
import standardSlugify from 'standard-slugify';
import { generateRandomString } from '../../utils/strings.js';
import { GridFSBucket } from 'mongodb';
import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { Cassette } from './model.js';
import { extractNestingPolygons, extractCurvesFromDXFLayer } from '../../utils/dxf-extractor.js';
import { OCCS_LAYER_CONTOUR_CASSETTE_FACE, OCCS_LAYER_CUT_OUTER } from '#utils/occs/layers.js';
import { isOccsDocument, occsQueueParameters } from '#utils/occs/parameters.js';
import { generateLayeredDxf } from '../../utils/dxf-writer.js';

/**
 * Cassette Templates Service - v24 Standardized
 */


function toDTO(cassette) {
  if (!cassette) return null;
  return new Cassette(cassette).toJSON();
}

function buildMappedLayerData(fileBuffer, layerMapping = {}) {
  return Object.entries(layerMapping).flatMap(([sourceLayer, layer]) => {
    if (!layer) return [];
    return extractCurvesFromDXFLayer(fileBuffer, sourceLayer).map((part, index) => ({
      layer,
      sourceLayer,
      coordinates: part.coordinates,
      handles: part.handles || [],
      entityType: part.entityType,
      sourceId: `${sourceLayer}:${part.handles?.[0] || index}`
    }));
  });
}

const GEOMETRY_REVISION_SCOPE = 'geometry';

function geometryRevisionContent(cassette) {
  const data = cassette.data || {};
  return {
    type: data.type || 'PARAMETRIC',
    definition: data.definition || null,
    parameters: data.parameters || []
  };
}

function geometryRevisionSnapshot(cassette) {
  return {
    identity: cassette.identity || null,
    data: geometryRevisionContent(cassette)
  };
}

function geometryRevisionPointer(revision) {
  if (!revision) return null;
  return {
    currentId: revision._id,
    number: revision.data?.number || 0,
    contentHash: revision.data?.contentHash || ''
  };
}

async function ensureGeometryRevision(cassette, userId, reason = 'content-change') {
  const revision = await entityRevisionsService.ensureForEntitySnapshot({
    entityType: 'cassette',
    entity: cassette,
    scope: GEOMETRY_REVISION_SCOPE,
    content: geometryRevisionContent(cassette),
    snapshot: geometryRevisionSnapshot(cassette),
    userId,
    reason
  });
  const data = {
    ...(cassette.data || {}),
    revisions: {
      ...(cassette.data?.revisions || {}),
      [GEOMETRY_REVISION_SCOPE]: geometryRevisionPointer(revision)
    }
  };
  const updated = await repository.updateById(cassette._id, { data });
  return { revision, cassette: updated };
}

export async function ensureCurrentGeometryRevision(cassetteOrId, userId = 'SYSTEM', reason = 'content-change') {
  const raw = typeof cassetteOrId === 'object'
    ? cassetteOrId
    : await repository.findById(toFlexibleId(cassetteOrId));
  if (!raw) throw createError({ statusCode: 404, message: 'Template not found' });
  return await ensureGeometryRevision(new Cassette(raw).toJSON(), userId, reason);
}

export function derivedFromGeometryRevision(revision, parameters = {}) {
  return entityRevisionsService.derivedFromRevision(revision, parameters);
}

function resolveTemplateDefinition(template = {}) {
  const candidates = [
    template.data?.definition,
    template.data?.definition?.definition,
    template.data?.definition?.occs,
    template.definition?.data,
    template.definition
  ].filter(candidate => candidate && typeof candidate === 'object');

  return candidates.find(isOccsDocument) ||
    candidates.find(candidate => (
      candidate.params ||
      candidate.extrusions ||
      candidate.extensions ||
      (candidate.parameters && !Array.isArray(candidate.parameters))
    )) ||
    null;
}

function assertEvaluatableParametricTemplate(template = {}) {
  const definition = resolveTemplateDefinition(template);
  if (!definition) {
    throw createError({ statusCode: 400, message: 'Cassette template has no construction definition' });
  }
  if (isOccsDocument(definition)) {
    if (!definition.extensions?.cutkit?.graphTree) {
      throw createError({ statusCode: 400, message: 'Cassette template has no OCCS graph tree' });
    }
    return definition;
  }
  const params = definition.params || {};
  if (!Object.prototype.hasOwnProperty.call(params, 'A') || !Object.prototype.hasOwnProperty.call(params, 'B')) {
    throw createError({ statusCode: 400, message: 'Cassette template requires A and B parameters for construction' });
  }
  return definition;
}

function normalizeConstructionParameters(template = {}, supplied = {}) {
  const definition = assertEvaluatableParametricTemplate(template);
  const defaults = occsQueueParameters(definition);
  const declaredNames = Array.isArray(template.data?.parameters) ? template.data.parameters : [];
  const declaredDefaults = Object.fromEntries(declaredNames.map(name => [name, defaults[name] ?? 1]));
  return {
    ...declaredDefaults,
    ...defaults,
    ...(supplied || {})
  };
}

export async function create(data, userId, userOrg, userRole, userPermissions) {
  // Lineage: Templates belong to the organization
  const targetOrgId = userOrg || userId;
  const lineage = { organizationId: toFlexibleId(targetOrgId) };

  if (userPermissions && !hasLineagePermission(userPermissions, lineage, 'cassettes', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied for cassettes' });
  }

  const slug = data.slug || `${standardSlugify(data.name || 'template', { keepCase: false })}-${generateRandomString(6)}`;
  const origin = createStatus('ACTIVE', userId, { note: 'Template created' });

  const cassetteData = {
    identity: createIdentity(data.name || 'New Template', slug),
    origin,
    status: origin,
    lineage,
    data: createData({
        type: data.type || 'PARAMETRIC', // PARAMETRIC | STANDARD
        definition: data.definition || data.data || null,
        parameters: data.parameters || []
    })
  };

  const cassette = await repository.create(cassetteData);
  const { cassette: updated } = await ensureGeometryRevision(cassette, userId, 'template-created');
  return toDTO(updated);
}

export async function upload(fileBuffer, fileName, name, userId, userOrg, userRole, userPermissions, mapping, parameters) {
  const targetOrgId = userOrg || userId;
  const lineage = { organizationId: toFlexibleId(targetOrgId) };

  if (userPermissions && !hasLineagePermission(userPermissions, lineage, 'cassettes', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const layerMapping = mapping || {};
  const polygonParts = extractNestingPolygons(fileBuffer, layerMapping, OCCS_LAYER_CUT_OUTER);
  if (!polygonParts.length) {
    throw createError({
      statusCode: 400,
      message: `DXF upload requires at least one closed polygon mapped to ${OCCS_LAYER_CUT_OUTER}`
    });
  }
  const layerData = buildMappedLayerData(fileBuffer, layerMapping);

  const db = await connectDB();
  const bucket = new GridFSBucket(db, { bucketName: 'cassettes' });
  const uploadStream = bucket.openUploadStream(fileName, {
    metadata: { userId, organizationId: targetOrgId }
  });

  await new Promise((resolve, reject) => {
    uploadStream.on('finish', resolve);
    uploadStream.on('error', reject);
    uploadStream.write(fileBuffer);
    uploadStream.end();
  });

  // 1. Create Template
  const slug = `${standardSlugify(name || fileName, { keepCase: false })}-${generateRandomString(6)}`;
  const origin = createStatus('ACTIVE', userId, { note: 'Standard template uploaded' });

  const templateData = {
    identity: createIdentity(name || fileName, slug),
    origin,
    status: origin,
    lineage,
    data: createData({
      type: 'STANDARD',
      definition: { mapping: layerMapping },
      parameters: parameters || []
    })
  };

  const template = await repository.create(templateData);
  const { revision, cassette: updatedTemplate } = await ensureGeometryRevision(template, userId, 'template-uploaded');

  const design = await cassetteDesignService.createFromTemplateUpload({
    name: `${name || fileName} (Base Design)`,
    lineage,
    templateId: template._id,
    polygonParts,
    layerData,
    geometryData: {
      polygonParts,
      layerData
    },
    dxfId: uploadStream.id,
    parameters: {},
    derivedFrom: derivedFromGeometryRevision(revision, {})
  }, userId);

  return {
    template: toDTO(updatedTemplate),
    design
  };
}

export async function list(userId, userOrg, userRole, userPermissions, query = {}) {
  const { limit, skip, status, ...rest } = query;

  const lineageFilter = getLineageFilter(userPermissions);
  const processedFilter = { ...rest };

  if (status) {
    processedFilter['status.state.primary'] = status;
  }

  const finalFilter = { ...lineageFilter, ...processedFilter };

  const cassettes = await repository.find(finalFilter, {
    limit: limit ? parseInt(limit) : 100,
    skip: skip ? parseInt(skip) : 0
  });

  return cassettes.map(toDTO);
}

export async function getById(id, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(toFlexibleId(id));
  if (!raw) throw createError({ statusCode: 404, message: 'Template not found' });

  const cassette = new Cassette(raw);

  if (userPermissions && !hasLineagePermission(userPermissions, cassette.lineage, 'cassettes', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  return cassette.toJSON();
}

export async function exportDxf(id, dimensions, userId, userOrg, userRole, userPermissions) {
  const template = await getById(id, userId, userOrg, userRole, userPermissions);

  if (template.data?.type === 'PARAMETRIC') {
    const { evaluateTemplate, generateSimpleDxf } = await import('../parametric-cassettes/service.js');
    const { polygons, nestingPolygons, layerData } = await evaluateTemplate(id, dimensions || {});
    return layerData?.length
      ? generateLayeredDxf({ layerData, polygonParts: nestingPolygons?.length ? nestingPolygons : polygons })
      : generateSimpleDxf(polygons);
  } else {
    const db = await connectDB();
    const design = await repository.findDesignByTemplateId(id);

    if (!design?.data?.geometry?.dxfId) {
      throw createError({ statusCode: 404, message: 'DXF not found for this template' });
    }

    const bucket = new GridFSBucket(db, { bucketName: 'cassettes' });
    return bucket.openDownloadStream(toFlexibleId(design.data.geometry.dxfId));
  }
}

export async function createDesignFromTemplate(id, parameters, userId, userOrg, userRole, userPermissions, options = {}) {
  const template = await getById(id, userId, userOrg, userRole, userPermissions);

  if (!hasLineagePermission(userPermissions || {}, template.lineage, 'cassettes', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (template.data?.type === 'PARAMETRIC') {
    assertEvaluatableParametricTemplate(template);
  }
  const constructionParameters = template.data?.type === 'PARAMETRIC'
    ? normalizeConstructionParameters(template, parameters || {})
    : (parameters || {});
  const templateName = template.identity?.name || 'Cassette Template';
  const revisionResult = await ensureCurrentGeometryRevision(template, userId, 'design-created');
  const derivedFrom = derivedFromGeometryRevision(revisionResult.revision, constructionParameters);

  if (template.data?.type !== 'PARAMETRIC') {
    const existing = await cassetteDesignService.getByTemplateId(
      id,
      userId,
      userOrg,
      userRole,
      userPermissions
    );
    if (existing) return existing;

    throw createError({ statusCode: 400, message: 'Uploaded templates require a base design DXF' });
  }

  const { evaluateTemplate, generateSimpleDxf } = await import('../parametric-cassettes/service.js');
  const {
    polygons,
    dimensions,
    nestingPolygons,
    layerData: evaluatedLayerData
  } = await evaluateTemplate(id, constructionParameters);
  if (!polygons?.length) {
    throw createError({ statusCode: 400, message: 'Template evaluation produced no geometry' });
  }
  const layerData = evaluatedLayerData || polygons.map((polygon, index) => ({
    layer: index === 0 ? OCCS_LAYER_CUT_OUTER : OCCS_LAYER_CONTOUR_CASSETTE_FACE,
    coordinates: polygon.coordinates,
    handles: polygon.handles || [(256 + index).toString(16).toUpperCase()]
  }));
  const dxfContent = layerData?.length
    ? generateLayeredDxf({ layerData, polygonParts: nestingPolygons?.length ? nestingPolygons : [polygons[0]] })
    : generateSimpleDxf(polygons);

  const db = await connectDB();
  const bucket = new GridFSBucket(db, { bucketName: 'cassettes' });
  const filename = `cassette-design-${id}-${Date.now()}.dxf`;
  const dxfId = await new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, {
      metadata: { userId, organizationId: userOrg || userId, templateId: id, type: 'CASSETTE_DESIGN_DXF' }
    });
    uploadStream.on('finish', () => resolve(uploadStream.id));
    uploadStream.on('error', reject);
    uploadStream.write(dxfContent);
    uploadStream.end();
  });

  return await cassetteDesignService.createFromTemplateUpload({
    name: options.name || `${templateName} Design`,
    lineage: template.lineage,
    templateId: id,
    polygonParts: nestingPolygons?.length ? nestingPolygons : [polygons[0]],
    layerData,
    geometryData: {
      polygonParts: nestingPolygons?.length ? nestingPolygons : [polygons[0]],
      layerData,
      dimensions
    },
    dxfId,
    parameters: dimensions || constructionParameters,
    derivedFrom
  }, userId, userPermissions);
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(toFlexibleId(id));
  if (!raw) throw createError({ statusCode: 404, message: 'Template not found' });
  const cassette = new Cassette(raw);

  if (!hasLineagePermission(userPermissions, cassette.lineage, 'cassettes', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (updates.status && typeof updates.status === 'string') {
    await statusService.transition('cassette', cassette._id, updates.status, userId, createTransitionAuth(userId, userRole, userPermissions), updates.statusMeta || {});
    delete updates.status;
  }

  const { identity, origin, status, lineage, data: updatesData, ...clean } = updates;

  if (updates.name) cassette.identity.name = updates.name;

  const normalizedUpdatesData = updatesData && (updatesData.params || updatesData.extrusions)
    ? { definition: updatesData }
    : (updatesData || {});

  const { name, ...cleanData } = clean;

  const cassetteData = {
    ...cassette.data,
    ...normalizedUpdatesData,
    ...cleanData
  };

  await repository.updateById(id, { identity: cassette.identity, data: cassetteData });
  const updatedRaw = await repository.findById(id);
  const { cassette: revisioned } = await ensureGeometryRevision(updatedRaw, userId, 'template-updated');
  return new Cassette(revisioned).toJSON();
}

export async function updateLayerMapping(id, mapping, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(toFlexibleId(id));
  if (!raw) throw createError({ statusCode: 404, message: 'Template not found' });
  const cassette = new Cassette(raw);

  if (!hasLineagePermission(userPermissions, cassette.lineage, 'cassettes', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const data = {
    ...cassette.data,
    definition: {
      ...(cassette.data?.definition || {}),
      mapping: mapping
    }
  };

  await repository.updateById(id, { data });
  const updatedRaw = await repository.findById(id);
  const { cassette: revisioned } = await ensureGeometryRevision(updatedRaw, userId, 'layer-mapping-updated');
  return new Cassette(revisioned).toJSON();
}

export async function updateParameters(id, parameters, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(toFlexibleId(id));
  if (!raw) throw createError({ statusCode: 404, message: 'Template not found' });
  const cassette = new Cassette(raw);

  if (!hasLineagePermission(userPermissions, cassette.lineage, 'cassettes', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const data = {
    ...cassette.data,
    parameters: parameters
  };

  await repository.updateById(id, { data });
  const updatedRaw = await repository.findById(id);
  const { cassette: revisioned } = await ensureGeometryRevision(updatedRaw, userId, 'parameters-updated');
  return new Cassette(revisioned).toJSON();
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  const cassette = await getById(toFlexibleId(id), userId, userOrg, userRole, userPermissions);

  if (!hasLineagePermission(userPermissions, cassette.lineage, 'cassettes', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  return await repository.deleteById(id);
}
