import { createError } from 'h3';
import * as repository from './repository.js';
import * as projectsService from '../projects/service.js';
import * as remnantsService from '../remnants/service.js';
import * as warehousesService from '../warehouses/service.js';
import { GeometryCapture } from './model.js';
import { createAttachment, createData, createStatus } from '../../core/blocks/index.js';
import { statusService, createTransitionAuth } from '../../core/machines/service.js';
import { createTaskRun } from '../../core/tasks/service.js';
import { hasLineagePermission, getLineageFilter } from '../../utils/permissions.js';
import { mapLineageQuery } from '../../utils/query.js';
import { generateRandomString } from '../../utils/strings.js';
import { toFlexibleId } from '../../utils/objectid.js';

const PHOTO_BUCKET = 'capturePhotos';

function toDTO(raw) {
  return raw ? new GeometryCapture(raw).toJSON() : null;
}

export async function create(data, userId, userOrg, userRole, userPermissions) {
  const mode = normalizeMode(data.mode);
  const lineage = await resolveLineage(mode, data, { userId, userOrg, userRole, userPermissions }, 'write');
  const feature = mode === 'REMNANT' ? 'materials' : 'projects';
  requireLineageAccess(lineage, feature, 'write', userPermissions);

  const fileId = data.fileId || data.photo?.fileId || data.photo?.id;
  if (!fileId) throw createError({ statusCode: 400, message: 'Capture photo fileId is required' });

  const bucketName = data.bucketName || data.photo?.bucketName || PHOTO_BUCKET;
  const fileName = data.fileName || data.photo?.filename || data.photo?.name || 'capture-photo';
  const captureUid = `capture-${generateRandomString(8)}`;
  const origin = createStatus('DRAFT', userId, { note: 'Geometry capture created' });

  const doc = {
    identity: {
      name: data.name || defaultNameForMode(mode),
      slug: captureUid,
      reference: captureUid
    },
    origin,
    status: origin,
    lineage,
    specs: {},
    attachments: {
      primary: createAttachment('CAPTURE_PHOTO', fileId, fileName, {
        bucketName,
        mimeType: data.mimeType || data.photo?.mimeType || 'image/*'
      })
    },
    data: createData({
      mode,
      calibration: normalizeCalibration(data.calibration || {}),
      geometry: null,
      extraction: {
        status: 'QUEUED',
        taskRunId: null,
        confidence: 0,
        diagnostics: []
      },
      output: null
    })
  };

  const created = await repository.create(doc);
  const taskRun = await createTaskRun('vision.extractGeometry', {
    entities: { geometryCapture: created._id.toString() },
    parameters: {
      mode,
      fileId: fileId.toString(),
      bucketName,
      fileUrl: `/api/files/download/${fileId.toString()}?bucket=${encodeURIComponent(bucketName)}`,
      calibration: doc.data.calibration
    }
  }, { userId, organizationId: userOrg, role: userRole }, {
    idempotencyKey: `geometry-capture:${created._id.toString()}:extract`
  });

  const processingStatus = createStatus('PROCESSING', userId, { note: 'Vision extraction queued', taskRunId: taskRun._id.toString() });
  const updated = await repository.updateById(created._id, {
    status: processingStatus,
    data: {
      ...created.data,
      extraction: {
        ...created.data.extraction,
        status: 'QUEUED',
        taskRunId: taskRun._id.toString()
      }
    }
  });

  return toDTO(updated);
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const finalFilter = mapLineageQuery({ ...getLineageFilter({ memberships: userPermissions.memberships }), ...filter });
  const captures = await repository.find(finalFilter);
  return captures.map(toDTO);
}

export async function getById(id, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Geometry capture not found' });
  const mode = raw.data?.mode || 'REMNANT';
  const feature = mode === 'REMNANT' ? 'materials' : 'projects';
  requireLineageAccess(raw.lineage, feature, 'read', userPermissions);
  return toDTO(raw);
}

export async function update(id, updates, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Geometry capture not found' });
  const mode = raw.data?.mode || 'REMNANT';
  const feature = mode === 'REMNANT' ? 'materials' : 'projects';
  requireLineageAccess(raw.lineage, feature, 'write', userPermissions);

  const { identity, status, origin, lineage, data: updatesData, specs, attachments, ...clean } = updates;
  const nextData = {
    ...(raw.data || {}),
    ...(updatesData || {}),
    ...clean
  };
  if (nextData.geometry) {
    nextData.geometry = normalizeGeometry(nextData.geometry);
  }

  const updated = await repository.updateById(id, {
    identity: updates.name ? { ...raw.identity, name: updates.name } : raw.identity,
    specs: specs || raw.specs || metricsForGeometry(nextData.geometry),
    data: nextData
  });
  return toDTO(updated);
}

export async function remove(id, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Geometry capture not found' });
  const feature = raw.data?.mode === 'FACADE' ? 'projects' : 'materials';
  requireLineageAccess(raw.lineage, feature, 'admin', userPermissions);
  await repository.deleteById(id);
  return { success: true };
}

export async function applyExtractionResult(id, result = {}) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Geometry capture not found' });

  if (result.ok === false) {
    const status = createStatus('FAILED', 'SYSTEM', { note: result.error || 'Geometry extraction failed' });
    const updated = await repository.updateById(id, {
      status,
      data: {
        ...(raw.data || {}),
        extraction: {
          ...(raw.data?.extraction || {}),
          status: 'FAILED',
          error: result.error || 'Geometry extraction failed',
          diagnostics: result.diagnostics || []
        }
      }
    });
    return toDTO(updated);
  }

  const geometry = normalizeGeometry(result.geometry || {});
  const metrics = metricsForGeometry(geometry);
  const status = createStatus('READY', 'SYSTEM', {
    note: 'Geometry extraction completed',
    confidence: Number(result.confidence || 0)
  });
  const updated = await repository.updateById(id, {
    status,
    specs: metrics,
    data: {
      ...(raw.data || {}),
      geometry,
      calibration: result.calibration || raw.data?.calibration || {},
      extraction: {
        ...(raw.data?.extraction || {}),
        status: 'READY',
        confidence: Number(result.confidence || 0),
        diagnostics: result.diagnostics || [],
        metrics
      }
    }
  });
  return toDTO(updated);
}

export async function confirm(id, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Geometry capture not found' });
  if (!raw.data?.geometry?.polygon?.outer?.length) {
    throw createError({ statusCode: 400, message: 'Geometry capture has no extracted polygon' });
  }

  const mode = raw.data.mode || 'REMNANT';
  const feature = mode === 'REMNANT' ? 'materials' : 'projects';
  requireLineageAccess(raw.lineage, feature, 'write', userPermissions);

  let output = raw.data.output || null;
  if (mode === 'REMNANT' && !output?.entityId) {
    const metrics = raw.specs || metricsForGeometry(raw.data.geometry);
    const remnant = await remnantsService.create({
      warehouseId: raw.lineage?.warehouseId,
      geometryData: raw.data.geometry,
      area: metrics.area || 0,
      width: metrics.width || 0,
      height: metrics.height || 0,
      thickness: raw.data?.calibration?.thickness || 0,
      material: raw.data?.calibration?.material || null,
      color: raw.data?.calibration?.color || null,
      source: {
        type: 'PHOTO_CAPTURE',
        geometryCaptureId: raw._id.toString(),
        photo: raw.attachments?.primary || null
      }
    }, userId, userOrg, userRole, userPermissions);
    output = { entityType: 'remnant', entityId: remnant._id?.toString?.() || remnant._id || remnant.id };
    if (raw.lineage?.warehouseId) {
      await warehousesService.updateInventoryCounts(raw.lineage.warehouseId, { totalRemnants: 1 });
    }
  } else if (mode === 'FACADE') {
    output = { entityType: 'facadeDraft', entityId: null };
  }

  await repository.updateById(id, {
    data: {
      ...(raw.data || {}),
      output
    }
  });
  await statusService.transition(
    'geometry_capture',
    id,
    'COMPLETE',
    'SYSTEM',
    createTransitionAuth('SYSTEM', 'SYSTEM'),
    { note: mode === 'REMNANT' ? 'Confirmed into remnant inventory' : 'Confirmed as facade draft' }
  );

  return await getById(id, userId, userOrg, userRole, userPermissions);
}

async function resolveLineage(mode, data, auth, level) {
  if (mode === 'REMNANT') {
    if (!data.warehouseId) throw createError({ statusCode: 400, message: 'warehouseId is required for remnant capture' });
    const warehouse = await warehousesService.getById(data.warehouseId);
    if (!warehouse) throw createError({ statusCode: 404, message: 'Warehouse not found' });
    requireLineageAccess(warehouse.lineage, 'materials', level, auth.userPermissions);
    return {
      ...(warehouse.lineage || {}),
      warehouseId: toFlexibleId(data.warehouseId)
    };
  }

  if (!data.projectId) throw createError({ statusCode: 400, message: 'projectId is required for facade capture' });
  const project = await projectsService.getById(data.projectId);
  if (!project) throw createError({ statusCode: 404, message: 'Project not found' });
  requireLineageAccess(project.lineage, 'projects', level, auth.userPermissions);
  return {
    ...(project.lineage || {}),
    projectId: toFlexibleId(data.projectId)
  };
}

function requireLineageAccess(lineage, feature, level, userPermissions = {}) {
  if (!hasLineagePermission({ memberships: userPermissions.memberships || [] }, lineage, feature, level)) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
}

function normalizeMode(mode = 'REMNANT') {
  const normalized = String(mode).toUpperCase();
  if (!['REMNANT', 'FACADE'].includes(normalized)) {
    throw createError({ statusCode: 400, message: 'mode must be REMNANT or FACADE' });
  }
  return normalized;
}

function normalizeCalibration(calibration = {}) {
  return {
    mode: calibration.mode || 'knownDimension',
    knownWidth: numberOrNull(calibration.knownWidth),
    knownHeight: numberOrNull(calibration.knownHeight),
    sheetWidth: numberOrNull(calibration.sheetWidth),
    sheetHeight: numberOrNull(calibration.sheetHeight),
    floorCount: numberOrNull(calibration.floorCount),
    floorHeight: numberOrNull(calibration.floorHeight),
    material: calibration.material || null,
    color: calibration.color || null,
    thickness: numberOrNull(calibration.thickness)
  };
}

function normalizeGeometry(geometry = {}) {
  const polygon = geometry.polygon || geometry;
  const outer = closeRing(normalizeRing(polygon.outer || []));
  const inner = (polygon.inner || polygon.holes || [])
    .map(ring => closeRing(normalizeRing(ring)))
    .filter(ring => ring.length >= 4);
  if (outer.length < 4) throw createError({ statusCode: 400, message: 'Geometry outer polygon requires at least 3 points' });
  const preview = geometry.preview || previewForPolygon({ outer, inner });
  return {
    ...geometry,
    polygon: { outer, inner },
    preview
  };
}

function normalizeRing(ring = []) {
  return ring
    .map(point => Array.isArray(point)
      ? [Number(point[0]), Number(point[1])]
      : [Number(point?.x), Number(point?.y)])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
}

function closeRing(ring = []) {
  if (!ring.length) return [];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, [...first]];
}

function metricsForGeometry(geometry = null) {
  const outer = geometry?.polygon?.outer || [];
  if (outer.length < 4) return {};
  const inner = geometry?.polygon?.inner || [];
  const bounds = boundsForRing(outer);
  const areaMm2 = Math.max(Math.abs(signedArea(outer)) - inner.reduce((sum, ring) => sum + Math.abs(signedArea(ring)), 0), 0);
  return {
    width: Math.round(bounds.width * 100) / 100,
    height: Math.round(bounds.height * 100) / 100,
    area: Math.round((areaMm2 / 1000000) * 10000) / 10000
  };
}

function signedArea(ring = []) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return area / 2;
}

function boundsForRing(ring = []) {
  const xs = ring.map(point => point[0]);
  const ys = ring.map(point => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function previewForPolygon(polygon) {
  const bounds = boundsForRing(polygon.outer);
  const pad = Math.max(bounds.width, bounds.height, 1) * 0.04;
  return {
    viewBox: `${bounds.minX - pad} ${bounds.minY - pad} ${bounds.width + pad * 2} ${bounds.height + pad * 2}`,
    layers: [
      {
        name: 'capture.outer',
        standardCode: 'cut.outer',
        paths: [polygonPath(polygon.outer)]
      },
      {
        name: 'capture.holes',
        standardCode: 'cut.inner',
        paths: polygon.inner.map(polygonPath)
      }
    ]
  };
}

function polygonPath(ring = []) {
  if (!ring.length) return '';
  const [first, ...rest] = ring;
  return `M${first[0]} ${first[1]} ${rest.map(point => `L${point[0]} ${point[1]}`).join(' ')} Z`;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function defaultNameForMode(mode) {
  return mode === 'FACADE' ? 'Facade geometry capture' : 'Remnant geometry capture';
}
