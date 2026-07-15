import * as repository from './repository.js';
import * as queuesRepository from '../queues/repository.js';
import * as entityRevisionsService from '../entity-revisions/service.js';
import * as artifactsService from '../artifacts/service.js';
import * as filesService from '../files/service.js';
import { createError } from 'h3';
import { hasLineagePermission, getLineageFilter } from '../../utils/permissions.js';
import {
  createIdentity,
  inheritLineage,
  createData
} from '../../core/blocks/index.js';
import { createTransitionAuth, statusService } from '../../core/machines/service.js';
import { GridFSBucket } from 'mongodb';
import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { CassetteDesign } from './model.js';
import { generateRandomString } from '../../utils/strings.js';
import { serializeForAccess, serializeManyForAccess } from '../../utils/entity-redaction.js';
import { generateLayeredDxf } from '../../utils/dxf-writer.js';

/**
 * Cassette Designs Service - v24 Standardized
 */


function toDTO(design, userPermissions = null) {
  if (!design) return null;
  return serializeForAccess('cassetteDesign', new CassetteDesign(design), userPermissions);
}

function hasCassetteDesignPermission(userPermissions, design, level) {
  return hasLineagePermission(userPermissions || {}, design, 'cassette_designs', level);
}

function normalizePrimaryStatuses(value) {
  if (Array.isArray(value)) return value.flatMap(normalizePrimaryStatuses);
  if (typeof value !== 'string') return [];
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function derivedFromTemplateFilter(templateId) {
  return {
    'provenance.derivedFrom.source.type': 'cassette',
    'provenance.derivedFrom.source.id': templateId?.toString?.() || templateId
  };
}

async function derivedFromTemplate(templateId, parameters = {}, explicitProvenance = null) {
  if (explicitProvenance) return explicitProvenance;
  if (!templateId) return null;
  const revision = await entityRevisionsService.getCurrentForEntity('cassette', templateId, 'geometry');
  return revision ? entityRevisionsService.derivedFromRevision(revision, parameters) : null;
}

export async function createFromQueue(queueId, data, userId, userRole, userPermissions) {
  const queue = await queuesRepository.findById(queueId);
  if (!queue) throw createError({ statusCode: 404, message: 'Queue not found' });

  // 1. Permission Check
  if (!hasLineagePermission(userPermissions, queue.lineage, 'projects', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  // 2. Lineage Inheritance
  const lineage = inheritLineage(queue, 'queue');

  const origin = await statusService.initialStatusForOrganization(
    'cassette_design',
    lineage.organizationId,
    userId,
    { note: 'Cassette design initialized' }
  );

  const designData = {
    identity: createIdentity(data.name || 'Cassette Design'),
    origin,
    status: origin,
    lineage,
    provenance: {
      derivedFrom: await derivedFromTemplate(
        data.templateId,
        data.parameters || {},
        data.provenance?.derivedFrom
      )
    },
    data: createData({
      geometry: {
        data: data.geometryData || null,
        dxfId: data.dxfId ? toFlexibleId(data.dxfId) : null
      },
      parameters: data.parameters || {}
    })
  };

  const created = await repository.create(designData);
  return toDTO(created, userPermissions);
}

export async function createFromTemplateUpload(data, userId, userPermissions = null) {
  const lineage = { ...(data.lineage || {}) };
  if (userPermissions && !hasLineagePermission(userPermissions, lineage, 'cassette_designs', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied for cassette designs' });
  }
  const origin = await statusService.initialStatusForOrganization(
    'cassette_design',
    lineage.organizationId,
    userId,
    { note: 'Initial design from upload' }
  );
  const slug = data.slug || `cassette-design-${generateRandomString(10)}`;
  const designData = {
    identity: createIdentity(data.name || 'Cassette Design', slug),
    origin,
    status: origin,
    lineage,
    relations: data.relations || {},
    provenance: {
      derivedFrom: await derivedFromTemplate(
        data.templateId,
        data.parameters || {},
        data.provenance?.derivedFrom
      )
    },
    data: createData({
      polygonParts: data.polygonParts || [],
      layerData: data.layerData || [],
      geometry: {
        data: data.geometryData || null,
        dxfId: data.dxfId ? toFlexibleId(data.dxfId) : null
      },
      parameters: data.parameters || {}
    })
  };

  const created = await repository.create(designData);
  return toDTO(created, userPermissions);
}

function polygonsFromDesignData(data = {}) {
  const geometryData = data.geometry?.data || {};
  const candidates = [
    geometryData.layerData,
    data.layerData,
    geometryData.polygonParts,
    data.polygonParts
  ];
  const source = candidates.find(items => Array.isArray(items) && items.length) || [];
  return source
    .filter(item => Array.isArray(item?.coordinates) && item.coordinates.length >= 3)
    .map(item => ({ coordinates: item.coordinates }));
}

function layeredDxfFromDesignData(data = {}) {
  const geometryData = data.geometry?.data || {};
  const layerData = Array.isArray(data.layerData) && data.layerData.length
    ? data.layerData
    : (Array.isArray(geometryData.layerData) ? geometryData.layerData : []);
  const polygonParts = Array.isArray(data.polygonParts) && data.polygonParts.length
    ? data.polygonParts
    : (Array.isArray(geometryData.polygonParts) ? geometryData.polygonParts : []);
  return generateLayeredDxf({
    layers: geometryData.preview?.layers || data.geometry?.preview?.layers || [],
    layerData,
    polygonParts
  });
}

export async function getById(id, userId, userRole, userPermissions) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Cassette design not found' });

  const design = new CassetteDesign(raw);

  if (userPermissions && !hasCassetteDesignPermission(userPermissions, design, 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  return serializeForAccess('cassetteDesign', design, userPermissions);
}

export async function getByTemplateId(templateId, userId, userOrg, userRole, userPermissions) {
  const filter = {
    ...getLineageFilter(userPermissions || {}),
    ...derivedFromTemplateFilter(templateId)
  };

  const designs = await repository.find(filter);
  return toDTO(designs[0], userPermissions) || null;
}

export async function exportDxf(id, userId, userRole, userPermissions) {
  const flexId = toFlexibleId(id);
  const raw = await repository.findById(flexId) ||
    (await repository.find(derivedFromTemplateFilter(id)))[0];
  if (!raw) throw createError({ statusCode: 404, message: 'Cassette design not found' });
  const design = new CassetteDesign(raw);

  if (userPermissions && !hasCassetteDesignPermission(userPermissions, design, 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  const layeredDxf = layeredDxfFromDesignData(design.data);
  if (layeredDxf) return layeredDxf;

  const sourceDxfRef = design.relations?.sourceDxf;
  if (sourceDxfRef?.id) {
    const artifact = await artifactsService.getById(sourceDxfRef.id, userId, null, userRole, userPermissions);
    const attachment = artifact.attachments?.primary;
    if (!attachment?.fileId) throw createError({ statusCode: 404, message: 'Source DXF artifact has no file' });
    return await filesService.getFileStream(
      attachment.fileId,
      attachment.metadata?.bucketName || attachment.bucketName || 'userDxf'
    );
  }

  const dxfId = design.data?.geometry?.dxfId;
  if (dxfId) {
    const db = await connectDB();
    const bucket = new GridFSBucket(db, { bucketName: 'cassettes' });
    return bucket.openDownloadStream(toFlexibleId(dxfId));
  }

  const polygons = polygonsFromDesignData(design.data);
  if (!polygons.length) {
    throw createError({ statusCode: 404, message: 'Cassette design has no DXF or polygon geometry' });
  }

  const { generateSimpleDxf } = await import('../parametric-cassettes/service.js');
  return generateSimpleDxf(polygons);
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const lineageFilter = getLineageFilter(userPermissions);

  const processedFilter = { ...filter };
  if (processedFilter.queueId) {
    processedFilter['lineage.queueId'] = toFlexibleId(processedFilter.queueId);
    delete processedFilter.queueId;
  }
  if (processedFilter.templateId) {
    Object.assign(processedFilter, derivedFromTemplateFilter(processedFilter.templateId));
    delete processedFilter.templateId;
  }
  const statuses = normalizePrimaryStatuses(processedFilter.primaryStatuses);
  if (statuses.length) processedFilter['status.state.primary'] = { $in: statuses };
  else if (processedFilter.status || processedFilter.primaryStatus) {
    processedFilter['status.state.primary'] = processedFilter.status || processedFilter.primaryStatus;
  }
  delete processedFilter.primaryStatuses;
  delete processedFilter.primaryStatus;
  delete processedFilter.status;

  const finalFilter = { ...lineageFilter, ...processedFilter };
  const designs = await repository.find(finalFilter);
  return serializeManyForAccess(
    'cassetteDesign',
    designs
      .map(design => new CassetteDesign(design))
      .filter(design => hasCassetteDesignPermission(userPermissions, design, 'read')),
    userPermissions
  );
}

export async function update(id, updates, userId, userRole, userPermissions) {
  const raw = await repository.findById(toFlexibleId(id));
  if (!raw) throw createError({ statusCode: 404, message: 'Cassette design not found' });
  const design = new CassetteDesign(raw);

  if (!hasCassetteDesignPermission(userPermissions, design, 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  if (updates.status) {
    await statusService.transition('cassette_design', design._id, updates.status, userId, createTransitionAuth(userId, userRole, userPermissions), updates.statusMeta || {});
    delete updates.status;
  }

  const {
    identity,
    origin,
    status,
    lineage,
    relations,
    provenance,
    attachments,
    specs,
    summary,
    data: updatesData,
    ...clean
  } = updates;

  if (updates.name) design.identity.name = updates.name;

  const designData = {
    ...design.data,
    ...updatesData,
    ...clean
  };

  await repository.updateById(id, { identity: design.identity, data: designData });
  const updatedRaw = await repository.findById(id);
  return toDTO(updatedRaw, userPermissions);
}

export async function remove(id, userId, userRole, userPermissions) {
  const raw = await repository.findById(toFlexibleId(id));
  if (!raw) throw createError({ statusCode: 404, message: 'Cassette design not found' });
  const design = new CassetteDesign(raw);

  if (!hasCassetteDesignPermission(userPermissions, design, 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  return await repository.deleteById(id);
}
