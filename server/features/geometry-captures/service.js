import { createError } from 'h3';
import * as repository from './repository.js';
import { createProcessUpdateHandler } from '../_template/process-update-handler.js';
import * as projectsService from '../projects/service.js';
import * as remnantsService from '../remnants/service.js';
import * as warehousesService from '../warehouses/service.js';
import * as artifactsService from '../artifacts/service.js';
import { GeometryCapture } from './model.js';
import { createData, createInstanceRef } from '../../core/blocks/index.js';
import { statusService, createTransitionAuth } from '../../core/machines/service.js';
import { createTaskRun } from '../../core/tasks/service.js';
import { hasLineagePermission, getLineageFilter } from '../../utils/permissions.js';
import { mapLineageQuery } from '../../utils/query.js';
import { generateRandomString } from '../../utils/strings.js';
import { toFlexibleId } from '../../utils/objectid.js';

const DEFAULT_PRESETS = {
  REMNANT: 'remnant_auto',
  FACADE: 'facade_auto'
};

function toDTO(raw) {
  return raw ? new GeometryCapture(raw).toJSON() : null;
}

export async function create(data, userId, userOrg, userRole, userPermissions) {
  const mode = normalizeMode(data.mode);
  const lineage = await resolveLineage(mode, data, { userId, userOrg, userRole, userPermissions }, 'write');
  const feature = mode === 'REMNANT' ? 'materials' : 'projects';
  requireLineageAccess(lineage, feature, 'write', userPermissions);

  const artifactId = data.artifactId || data.relations?.sourcePhoto?.id;
  if (!artifactId) throw createError({ statusCode: 400, message: 'Capture photo artifact is required' });
  const sourcePhoto = await artifactsService.getById(artifactId, userId, userOrg, userRole, userPermissions);
  assertCapturePhotoArtifact(sourcePhoto);
  const captureUid = `capture-${generateRandomString(8)}`;
  const origin = await statusService.initialStatusForOrganization('geometry_capture', lineage.organizationId, userId, { note: 'Geometry capture created' });

  const revision = createRevision({
    mode,
    calibration: normalizeCalibration(data.calibration || {}),
    preset: normalizePreset(mode, data.preset),
    prompt: normalizePrompt(data.prompt)
  });

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
    relations: { sourcePhoto: createInstanceRef('artifact', sourcePhoto._id) },
    attachments: {},
    data: createData({
      mode,
      activeRevisionId: null,
      revisions: [revision],
      calibration: revision.calibration,
      prompt: revision.prompt,
      geometry: null,
      extraction: {
        status: 'QUEUED',
        taskRunId: null,
        revisionId: revision.id,
        preset: revision.preset,
        confidence: 0,
        diagnostics: []
      },
      output: null
    })
  };

  const created = await repository.create(doc);
  const taskRun = await enqueueExtractionTask(created, revision, { userId, organizationId: userOrg, role: userRole });

  const queuedRevision = { ...revision, taskRunId: taskRun._id.toString() };
  await repository.updateById(created._id, {
    data: {
      ...created.data,
      revisions: [queuedRevision],
      extraction: {
        ...created.data.extraction,
        status: 'QUEUED',
        taskRunId: taskRun._id.toString(),
        revisionId: revision.id,
        preset: revision.preset
      }
    }
  });
  await applyGeometryCaptureIntent(created._id, 'queueExtraction', createTransitionAuth('SYSTEM', 'SYSTEM'), {
    note: 'Vision extraction queued',
    taskRunId: taskRun._id.toString()
  });
  return await getById(created._id, userId, userOrg, userRole, userPermissions);
}

export async function list(userId, userOrg, userRole, userPermissions, filter = {}) {
  const finalFilter = mapLineageQuery({ ...getLineageFilter(userPermissions), ...filter });
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

export async function recalculate(id, options = {}, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Geometry capture not found' });
  const mode = raw.data?.mode || 'REMNANT';
  const feature = mode === 'REMNANT' ? 'materials' : 'projects';
  requireLineageAccess(raw.lineage, feature, 'write', userPermissions);

  await resolveCapturePhotoArtifact(raw, { userId, userOrg, userRole, userPermissions });

  const revision = createRevision({
    mode,
    calibration: normalizeCalibration({ ...(raw.data?.calibration || {}), ...(options.calibration || {}) }),
    preset: normalizePreset(mode, options.preset || raw.data?.extraction?.preset),
    prompt: normalizePrompt(options.prompt || raw.data?.prompt || {})
  });
  const nextData = {
    ...(raw.data || {}),
    revisions: [...normalizedRevisions(raw), revision],
    extraction: {
      ...(raw.data?.extraction || {}),
      status: 'QUEUED',
      taskRunId: null,
      revisionId: revision.id,
      preset: revision.preset,
      confidence: 0,
      diagnostics: []
    },
    prompt: revision.prompt
  };

  const saved = await repository.updateById(id, { data: nextData });
  const taskRun = await enqueueExtractionTask(saved, revision, { userId, organizationId: userOrg, role: userRole });
  const queuedRevision = { ...revision, taskRunId: taskRun._id.toString() };
  await repository.updateById(id, {
    data: {
      ...(saved.data || {}),
      revisions: replaceRevision(saved.data?.revisions || [], queuedRevision),
      extraction: {
        ...(saved.data?.extraction || {}),
        status: 'QUEUED',
        taskRunId: taskRun._id.toString(),
        revisionId: revision.id,
        preset: revision.preset
      }
    }
  });
  await applyGeometryCaptureIntent(id, 'queueExtraction', createTransitionAuth('SYSTEM', 'SYSTEM'), {
    note: 'Geometry extraction recalculation queued',
    taskRunId: taskRun._id.toString(),
    revisionId: revision.id
  });
  return await getById(id, userId, userOrg, userRole, userPermissions);
}

export async function createManualRevision(id, options = {}, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Geometry capture not found' });
  const mode = raw.data?.mode || 'REMNANT';
  const feature = mode === 'REMNANT' ? 'materials' : 'projects';
  requireLineageAccess(raw.lineage, feature, 'write', userPermissions);

  const geometry = normalizeGeometry(options.geometry || {});
  const calibration = normalizeCalibration({ ...(raw.data?.calibration || {}), ...(options.calibration || {}) });
  const metrics = metricsForGeometry(geometry);
  const revisionId = createRevisionId();
  const diagnostics = ['source:manual_edit'];
  if (options.reason) diagnostics.push(`reason:${String(options.reason).slice(0, 80)}`);
  const revision = {
    id: revisionId,
    status: 'READY',
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    taskRunId: null,
    preset: 'manual_edit',
    calibration,
    prompt: normalizePrompt(options.prompt || raw.data?.prompt || {}),
    geometry,
    confidence: 1,
    diagnostics,
    metrics,
    error: null
  };
  await repository.updateById(id, {
    specs: metrics,
    data: {
      ...(raw.data || {}),
      activeRevisionId: revisionId,
      revisions: [...normalizedRevisions(raw), revision],
      calibration,
      geometry,
      extraction: {
        ...(raw.data?.extraction || {}),
        status: 'READY',
        revisionId,
        preset: revision.preset,
        confidence: revision.confidence,
        diagnostics,
        metrics,
        error: null
      }
    }
  });
  await applyGeometryCaptureIntent(id, 'extractionReady', createTransitionAuth('SYSTEM', 'SYSTEM'), {
    note: 'Geometry capture manually edited',
    revisionId
  });
  return await getById(id, userId, userOrg, userRole, userPermissions);
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
  const revisionId = result.revisionId || raw.data?.extraction?.revisionId || raw.data?.activeRevisionId || createRevisionId();
  const revisions = ensureRevision(raw, revisionId, result);

  if (result.ok === false) {
    const hasActiveGeometry = Boolean(raw.data?.geometry?.polygon?.outer?.length);
    const failedRevision = {
      ...findRevision(revisions, revisionId),
      status: 'FAILED',
      completedAt: new Date().toISOString(),
      error: result.error || 'Geometry extraction failed',
      diagnostics: result.diagnostics || []
    };
    await repository.updateById(id, {
      data: {
        ...(raw.data || {}),
        revisions: replaceRevision(revisions, failedRevision),
        extraction: {
          ...(raw.data?.extraction || {}),
          status: 'FAILED',
          revisionId,
          preset: failedRevision.preset,
          error: result.error || 'Geometry extraction failed',
          diagnostics: result.diagnostics || []
        }
      }
    });
    await applyGeometryCaptureIntent(id, hasActiveGeometry ? 'extractionReady' : 'extractionFailed', createTransitionAuth('SYSTEM', 'SYSTEM'), {
      note: result.error || 'Geometry extraction failed',
      revisionId
    });
    const updated = await repository.findById(id);
    return toDTO(updated);
  }

  const geometry = normalizeGeometry(result.geometry || {});
  const metrics = metricsForGeometry(geometry);
  const readyRevision = {
    ...findRevision(revisions, revisionId),
    status: 'READY',
    completedAt: new Date().toISOString(),
    geometry,
    calibration: result.calibration || raw.data?.calibration || {},
    confidence: Number(result.confidence || 0),
    diagnostics: result.diagnostics || [],
    metrics,
    error: null
  };
  await repository.updateById(id, {
    specs: metrics,
    data: {
      ...(raw.data || {}),
      activeRevisionId: revisionId,
      revisions: replaceRevision(revisions, readyRevision),
      geometry,
      calibration: result.calibration || raw.data?.calibration || {},
      extraction: {
        ...(raw.data?.extraction || {}),
        status: 'READY',
        revisionId,
        preset: readyRevision.preset,
        confidence: Number(result.confidence || 0),
        diagnostics: result.diagnostics || [],
        metrics
      }
    }
  });
  await applyGeometryCaptureIntent(id, 'extractionReady', createTransitionAuth('SYSTEM', 'SYSTEM'), {
    note: 'Geometry extraction completed',
    revisionId,
    confidence: Number(result.confidence || 0)
  });
  const updated = await repository.findById(id);
  return toDTO(updated);
}

export async function activateRevision(id, revisionId, userId, userOrg, userRole, userPermissions) {
  const raw = await repository.findById(id);
  if (!raw) throw createError({ statusCode: 404, message: 'Geometry capture not found' });
  const mode = raw.data?.mode || 'REMNANT';
  const feature = mode === 'REMNANT' ? 'materials' : 'projects';
  requireLineageAccess(raw.lineage, feature, 'write', userPermissions);

  const revision = findRevision(raw.data?.revisions || [], revisionId);
  if (!revision) throw createError({ statusCode: 404, message: 'Geometry capture revision not found' });
  if (revision.status !== 'READY' || !revision.geometry?.polygon?.outer?.length) {
    throw createError({ statusCode: 400, message: 'Only successful geometry revisions can be activated' });
  }

  const geometry = normalizeGeometry(revision.geometry);
  const metrics = revision.metrics || metricsForGeometry(geometry);
  await repository.updateById(id, {
    specs: metrics,
    data: {
      ...(raw.data || {}),
      activeRevisionId: revisionId,
      geometry,
      calibration: revision.calibration || raw.data?.calibration || {},
      extraction: {
        ...(raw.data?.extraction || {}),
        status: 'READY',
        revisionId,
        preset: revision.preset,
        confidence: Number(revision.confidence || 0),
        diagnostics: revision.diagnostics || [],
        metrics,
        error: null
      }
    }
  });
  await applyGeometryCaptureIntent(id, 'activateRevision', createTransitionAuth('SYSTEM', 'SYSTEM'), {
    note: 'Geometry capture revision activated',
    revisionId
  });
  return await getById(id, userId, userOrg, userRole, userPermissions);
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
  if (mode === 'REMNANT' && !output?.instanceId) {
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
        sourcePhoto: raw.relations?.sourcePhoto || null
      }
    }, userId, userOrg, userRole, userPermissions);
    output = { typeId: 'remnant', instanceId: remnant._id?.toString?.() || remnant._id || remnant.id };
    if (raw.lineage?.warehouseId) {
      await warehousesService.updateInventoryCounts(raw.lineage.warehouseId, { totalRemnants: 1 });
    }
  } else if (mode === 'FACADE') {
    output = { typeId: 'facadeDraft', instanceId: null };
  }

  await repository.updateById(id, {
    data: {
      ...(raw.data || {}),
      output
    }
  });
  await applyGeometryCaptureIntent(id, 'confirmGeometry', createTransitionAuth('SYSTEM', 'SYSTEM'), {
    note: mode === 'REMNANT' ? 'Confirmed into remnant inventory' : 'Confirmed as facade draft'
  });

  return await getById(id, userId, userOrg, userRole, userPermissions);
}

async function applyGeometryCaptureIntent(id, intent, auth, metadata = {}) {
  return await statusService.applyIntent('geometry_capture', id, intent, auth, metadata);
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
  if (!hasLineagePermission(userPermissions, lineage, feature, level)) {
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
    materialId: calibration.materialId || null,
    materialCode: calibration.materialCode || null,
    materialName: calibration.materialName || null,
    material: calibration.material || null,
    color: calibration.color || null,
    thickness: numberOrNull(calibration.thickness)
  };
}

function normalizePreset(mode, preset) {
  const normalizedMode = normalizeMode(mode);
  const allowed = normalizedMode === 'FACADE'
    ? ['facade_auto', 'facade_grounded_sam2', 'facade_sam2_auto', 'facade_edges', 'facade_threshold', 'facade_windows_high_contrast']
    : ['remnant_auto', 'remnant_sam2_auto', 'remnant_grounded_sam2', 'remnant_light_on_dark', 'remnant_dark_on_light', 'remnant_sheet_remainder'];
  return allowed.includes(preset) ? preset : DEFAULT_PRESETS[normalizedMode];
}

function createRevision({ mode, calibration, preset, prompt }) {
  return {
    id: createRevisionId(),
    status: 'QUEUED',
    createdAt: new Date().toISOString(),
    taskRunId: null,
    preset: normalizePreset(mode, preset),
    calibration,
    prompt: normalizePrompt(prompt),
    geometry: null,
    confidence: 0,
    diagnostics: [],
    metrics: {},
    error: null
  };
}

function createRevisionId() {
  return `rev-${generateRandomString(8)}`;
}

async function enqueueExtractionTask(capture, revision, auth) {
  const artifact = await resolveCapturePhotoArtifact(capture);
  const attachment = artifact.attachments?.primary || {};
  const fileId = attachment.fileId?.toString?.() || attachment.fileId;
  const bucketName = attachment.metadata?.bucketName || attachment.bucketName || 'uploads';
  return await createTaskRun('vision.extractGeometry', {
    entities: {
      geometryCapture: capture._id.toString(),
      sourcePhoto: artifact._id.toString()
    },
    parameters: {
      mode: capture.data?.mode || 'REMNANT',
      revisionId: revision.id,
      preset: revision.preset,
      fileId,
      bucketName,
      fileUrl: `/api/files/download/${fileId}?bucket=${encodeURIComponent(bucketName)}`,
      calibration: revision.calibration,
      prompt: revision.prompt
    }
  }, auth, {
    idempotencyKey: `geometry-capture:${capture._id.toString()}:extract:${revision.id}`
  });
}

async function resolveCapturePhotoArtifact(capture, auth = {}) {
  const ref = capture.relations?.sourcePhoto;
  if (!ref?.id) throw createError({ statusCode: 400, message: 'Geometry capture has no source photo artifact' });
  const artifact = await artifactsService.getById(ref.id, auth.userId, auth.userOrg, auth.userRole, auth.userPermissions);
  assertCapturePhotoArtifact(artifact);
  return artifact;
}

function assertCapturePhotoArtifact(artifact = {}) {
  if (artifact.data?.type !== 'CAPTURE_PHOTO') {
    throw createError({ statusCode: 400, message: 'Geometry capture source must be a CAPTURE_PHOTO artifact' });
  }
  if (!artifact.attachments?.primary?.fileId) {
    throw createError({ statusCode: 400, message: 'Capture photo artifact has no file' });
  }
}

function normalizedRevisions(raw) {
  if (Array.isArray(raw.data?.revisions) && raw.data.revisions.length) return raw.data.revisions;
  if (raw.data?.geometry?.polygon?.outer?.length) {
    const metrics = raw.specs || metricsForGeometry(raw.data.geometry);
    const revision = {
      id: raw.data?.activeRevisionId || createRevisionId(),
      status: 'READY',
      createdAt: raw.status?.timestamp || raw.origin?.timestamp || new Date().toISOString(),
      completedAt: raw.status?.timestamp || new Date().toISOString(),
      taskRunId: raw.data?.extraction?.taskRunId || null,
      preset: raw.data?.extraction?.preset || normalizePreset(raw.data?.mode || 'REMNANT'),
      calibration: raw.data?.calibration || {},
      prompt: raw.data?.prompt || {},
      geometry: raw.data.geometry,
      confidence: Number(raw.data?.extraction?.confidence || 0),
      diagnostics: raw.data?.extraction?.diagnostics || [],
      metrics,
      error: null
    };
    return [revision];
  }
  return [];
}

function ensureRevision(raw, revisionId, result = {}) {
  const revisions = normalizedRevisions(raw);
  if (findRevision(revisions, revisionId)) return revisions;
  return [
    ...revisions,
    {
      id: revisionId,
      status: 'QUEUED',
      createdAt: new Date().toISOString(),
      taskRunId: raw.data?.extraction?.taskRunId || null,
      preset: result.preset || raw.data?.extraction?.preset || normalizePreset(raw.data?.mode || 'REMNANT'),
      calibration: result.calibration || raw.data?.calibration || {},
      prompt: result.prompt || raw.data?.prompt || {},
      geometry: null,
      confidence: 0,
      diagnostics: [],
      metrics: {},
      error: null
    }
  ];
}

function findRevision(revisions = [], revisionId) {
  return revisions.find(revision => revision.id === revisionId);
}

function replaceRevision(revisions = [], revision) {
  return revisions.map(item => item.id === revision.id ? revision : item);
}

function normalizePrompt(prompt = {}) {
  const outer = normalizePromptRing(prompt.outer || []);
  const holes = (prompt.holes || prompt.inner || [])
    .map(normalizePromptRing)
    .filter(ring => ring.length >= 3);
  return outer.length >= 3 ? { outer, holes } : {};
}

function normalizePromptRing(ring = []) {
  return ring
    .map(point => Array.isArray(point)
      ? [clampUnit(point[0]), clampUnit(point[1])]
      : [clampUnit(point?.x), clampUnit(point?.y)])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
}

function clampUnit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return NaN;
  return Math.min(Math.max(number, 0), 1);
}

function normalizeGeometry(geometry = {}) {
  const polygon = geometry.polygon || geometry;
  const outer = closeRing(normalizeRing(polygon.outer || []));
  const inner = (polygon.inner || polygon.holes || [])
    .map(ring => closeRing(normalizeRing(ring)))
    .filter(ring => ring.length >= 4);
  if (outer.length < 4) throw createError({ statusCode: 400, message: 'Geometry outer polygon requires at least 3 points' });
  const preview = previewForPolygon({ outer, inner });
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

export const processUpdate = createProcessUpdateHandler({
  typeId: 'geometry_capture',
  repository,
  Model: GeometryCapture
});
