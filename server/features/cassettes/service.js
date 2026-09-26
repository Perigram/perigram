import * as repository from './repository.js';
import { createProcessUpdateHandler } from '../_template/process-update-handler.js';
import * as instanceRevisionsService from '../instance-revisions/service.js';
import * as artifactsService from '../artifacts/service.js';
import * as filesService from '../files/service.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '../../utils/permissions.js';
import {
  createIdentity,
  createData
} from '../../core/blocks/index.js';
import { createTransitionAuth, stateService } from '../../core/machines/service.js';
import standardSlugify from 'standard-slugify';
import { generateRandomString } from '../../utils/strings.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { Cassette } from './model.js';
import { serializeForAccess } from '../../utils/entity-redaction.js';
import { extractNestingPolygons, extractCurvesFromDXFLayer } from '../../utils/dxf-extractor.js';
import { OCCS_LAYER_CUT_OUTER } from '#utils/occs/layers.js';
import { isOccsDocument } from '#utils/occs/parameters.js';
import { createDefaultOccsCassetteTemplateDefinition } from '#utils/occs/templates.js';
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
      typeId: part.typeId,
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
  const revision = await instanceRevisionsService.ensureForEntitySnapshot({
    typeId: 'cassette',
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

export async function create(data, userId, userOrg, userRole, userPermissions) {
  // Lineage: Templates belong to the organization
  const targetOrgId = userOrg || userId;
  const lineage = { organizationId: toFlexibleId(targetOrgId) };
  const libraryId = data.libraryId || data.data?.libraryId;
  if (libraryId) lineage.libraryId = toFlexibleId(libraryId);

  const origin = await stateService.initialStatusForOrganization('cassette', targetOrgId, userId, { note: 'Template created' });

  if (userPermissions && !hasLineagePermission(userPermissions, { lineage, status: origin }, 'cassettes', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied for cassettes' });
  }

  const name = data.name || data.identity?.name || 'New Template';
  const slug = data.slug || data.identity?.slug || `${standardSlugify(name, { keepCase: false })}-${generateRandomString(6)}`;
  const suppliedDefinition = data.definition || data.data?.definition;
  if (suppliedDefinition && !isOccsDocument(suppliedDefinition)) {
    throw createError({ statusCode: 400, message: 'Cassette definition must be a valid OCCS document' });
  }
  const definition = suppliedDefinition || createDefaultOccsCassetteTemplateDefinition();

  const cassetteData = {
    identity: createIdentity(name, slug),
    origin,
    status: origin,
    lineage,
    provenance: data.provenance || {},
    data: createData({
        type: data.type || 'PARAMETRIC', // PARAMETRIC | STANDARD
        definition,
        parameters: data.parameters || data.data?.parameters || Object.keys(definition.parameters || {})
    })
  };

  const cassette = await repository.create(cassetteData);
  const { cassette: updated } = await ensureGeometryRevision(cassette, userId, 'template-created');
  return toDTO(updated);
}

export async function importFromArtifact(artifactId, name, userId, userOrg, userRole, userPermissions, mapping, parameters) {
  const targetOrgId = userOrg || userId;
  const lineage = { organizationId: toFlexibleId(targetOrgId) };

  if (userPermissions && !hasLineagePermission(userPermissions, lineage, 'cassettes', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const artifact = await artifactsService.getById(artifactId, userId, userOrg, userRole, userPermissions);
  if (artifact.data?.type !== 'DXF_SOURCE' || !artifact.attachments?.primary?.fileId) {
    throw createError({ statusCode: 400, message: 'Cassette import requires a DXF_SOURCE artifact with a file' });
  }
  const attachment = artifact.attachments.primary;
  const bucketName = attachment.metadata?.bucketName || attachment.bucketName || 'userDxf';
  const fileBuffer = await filesService.getFileBuffer(attachment.fileId, bucketName);
  const fileName = attachment.name || artifact.identity?.name || 'cassette.dxf';
  const layerMapping = mapping || {};
  const polygonParts = extractNestingPolygons(fileBuffer, layerMapping, OCCS_LAYER_CUT_OUTER);
  if (!polygonParts.length) {
    throw createError({
      statusCode: 400,
      message: `DXF upload requires at least one closed polygon mapped to ${OCCS_LAYER_CUT_OUTER}`
    });
  }
  const layerData = buildMappedLayerData(fileBuffer, layerMapping);

  // 1. Create Template
  const slug = `${standardSlugify(name || fileName, { keepCase: false })}-${generateRandomString(6)}`;
  const origin = await stateService.initialStatusForOrganization('cassette', targetOrgId, userId, { note: 'Standard template uploaded' });

  const templateData = {
    identity: createIdentity(name || fileName, slug),
    origin,
    status: origin,
    lineage,
    relations: { sourceDxf: { type: 'artifact', id: artifact._id.toString() } },
    data: createData({
      type: 'STANDARD',
      definition: { mapping: layerMapping },
      parameters: parameters || [],
      // The uploaded geometry is the template's own nestable content: the
      // extracted cut contour and mapped semantic layers live on the
      // cassette document, so previews, exports, and the nesting solver
      // read one record.
      polygonParts,
      layerData
    })
  };

  const template = await repository.create(templateData);
  const { cassette: updatedTemplate } = await ensureGeometryRevision(template, userId, 'template-uploaded');

  return toDTO(updatedTemplate);
}

export async function list(userId, userOrg, userRole, userPermissions, query = {}) {
  const { limit, skip, status, primaryState, primaryStates, ...rest } = query;

  const lineageFilter = getLineageFilter(userPermissions);
  const processedFilter = normalizeLineageQuery(rest);

  // Wire filter vocabulary is primaryStates; the v24 cassettes storage
  // keeps its status block, so the storage path targets the block.
  const statuses = normalizePrimaryStatuses(primaryStates);
  if (statuses.length) processedFilter['status.state.primary'] = { $in: statuses };
  else if (status || primaryState) processedFilter['status.state.primary'] = status || primaryState;

  const finalFilter = { ...lineageFilter, ...processedFilter };

  const cassettes = await repository.find(finalFilter, {
    limit: limit ? parseInt(limit) : 100,
    skip: skip ? parseInt(skip) : 0
  });

  return cassettes
    .map(toDTO)
    .filter(cassette => hasLineagePermission(userPermissions, cassette, 'cassettes', 'read'));
}

export async function listPreviewByLibraries(libraryIds = [], userId, userOrg, userRole, userPermissions, options = {}) {
  const ids = Array.from(new Set(libraryIds.flatMap(id => flexibleLookupValues(id)).filter(Boolean)));
  if (!ids.length) return {};

  const limit = Math.max(Number(options.limit || 4), 1);
  const raws = await repository.find({
    ...getLineageFilter(userPermissions),
    'lineage.libraryId': { $in: ids }
  });
  const previews = {};
  const cassettes = raws
    .map(raw => new Cassette(raw).toJSON())
    .filter(cassette => hasLineagePermission(userPermissions, cassette, 'cassettes', 'read'))
    .sort(sortByStatusTimestampDesc);

  for (const cassette of cassettes) {
    const libraryId = cassette.lineage?.libraryId?.toString?.() || cassette.lineage?.libraryId;
    if (!libraryId) continue;
    previews[libraryId] ||= [];
    if (previews[libraryId].length >= limit) continue;
    previews[libraryId].push(cassettePreview(cassette, userPermissions));
  }

  return previews;
}

function normalizeLineageQuery(query = {}) {
  const normalized = { ...query };
  for (const key of ['projectId', 'queueId', 'warehouseId', 'cassetteId', 'libraryId']) {
    if (normalized[key] !== undefined) {
      normalized[`lineage.${key}`] = toFlexibleId(normalized[key]);
      delete normalized[key];
    }
  }
  return normalized;
}

function normalizePrimaryStatuses(value) {
  if (Array.isArray(value)) return value.flatMap(normalizePrimaryStatuses);
  if (typeof value !== 'string') return [];
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function flexibleLookupValues(id) {
  if (id === null || id === undefined) return [];
  const stringId = id?.toString?.() || id;
  const flexibleId = toFlexibleId(id);
  return [flexibleId, stringId].filter((value, index, values) => (
    value !== null && value !== undefined && values.findIndex(item => item?.toString?.() === value?.toString?.()) === index
  ));
}

function sortByStatusTimestampDesc(left = {}, right = {}) {
  return statusTimestamp(right) - statusTimestamp(left);
}

function statusTimestamp(entity = {}) {
  const value = entity.status?.timestamp || entity.origin?.timestamp || entity.updatedAt || entity.createdAt;
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function cassettePreview(cassette = {}, userPermissions = null) {
  const preview = {
    _id: cassette._id?.toString?.() || cassette._id,
    typeId: 'cassette',
    identity: {
      ...(cassette.identity || {}),
      name: cassette.identity?.name || cassette.identity?.slug || cassette.identity?.uid || 'Cassette'
    },
    origin: cassette.origin || null,
    status: cassette.status || null,
    lineage: cassette.lineage || {},
    data: {
      type: cassette.data?.type || null,
      definition: cassette.data?.definition || null,
      geometry: cassette.data?.geometry || null,
      layerData: Array.isArray(cassette.data?.layerData) ? cassette.data.layerData : [],
      polygonParts: Array.isArray(cassette.data?.polygonParts) ? cassette.data.polygonParts : [],
      parameters: Array.isArray(cassette.data?.parameters) ? cassette.data.parameters : [],
      revisions: cassette.data?.revisions || {}
    },
    summary: {}
  };
  return serializeForAccess('cassette', preview, userPermissions);
}


export async function getById(id, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(toFlexibleId(id));
  if (!raw) throw createError({ statusCode: 404, message: 'Template not found' });

  const cassette = new Cassette(raw);

  if (userPermissions && !hasLineagePermission(userPermissions, cassette, 'cassettes', 'read')) {
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
  }

  // STANDARD templates export their own uploaded geometry: the extracted
  // semantic layers and cut contour are the export source of truth.
  const layerData = Array.isArray(template.data?.layerData) ? template.data.layerData : [];
  const polygonParts = Array.isArray(template.data?.polygonParts) ? template.data.polygonParts : [];
  if (!layerData.length && !polygonParts.length) {
    throw createError({ statusCode: 404, message: 'DXF not found for this template' });
  }
  return generateLayeredDxf({ layerData, polygonParts });
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(toFlexibleId(id));
  if (!raw) throw createError({ statusCode: 404, message: 'Template not found' });
  const cassette = new Cassette(raw);

  if (!hasLineagePermission(userPermissions, cassette, 'cassettes', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (updates.state && typeof updates.state === 'string') {
    await stateService.transitionWithResult({
      typeId: 'cassette',
      targetId: cassette._id,
      targetState: updates.state,
      auth: createTransitionAuth(userId, userRole, userPermissions),
      context: updates.stateMeta || {}
    });
    delete updates.state;
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

  if (!hasLineagePermission(userPermissions, cassette, 'cassettes', 'write')) {
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

  if (!hasLineagePermission(userPermissions, cassette, 'cassettes', 'write')) {
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

  if (!hasLineagePermission(userPermissions, cassette, 'cassettes', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  return await repository.deleteById(id);
}

export const processUpdate = createProcessUpdateHandler({
  typeId: 'cassette',
  repository,
  Model: Cassette
});
