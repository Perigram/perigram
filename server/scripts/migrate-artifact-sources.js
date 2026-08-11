import { ObjectId } from 'mongodb';
import { connectDB } from '../db/mongo.js';
import { toFlexibleId } from '../utils/objectid.js';

const APPLY = process.argv.includes('--apply');

function stringId(value) {
  return value?.toString?.() || value || '';
}

function availableStatus(note) {
  const timestamp = new Date();
  return {
    state: {
      schemaVersion: 2,
      primary: 'AVAILABLE',
      active: { main: 'AVAILABLE' },
      regions: { main: { state: 'AVAILABLE', path: ['AVAILABLE'] } }
    },
    userId: 'SYSTEM',
    timestamp,
    metadata: { note },
    eventId: null,
    lifecycle: { actors: [], attachments: {}, data: {} }
  };
}

export function normalizeLegacyFileAttachment(value = {}, defaults = {}) {
  const fileId = value.fileId || value.id || value._id;
  if (!fileId) return null;
  const bucketName = value.metadata?.bucketName || value.bucketName || value.bucket || defaults.bucketName || 'uploads';
  return {
    kind: defaults.type || value.kind || '',
    fileId,
    name: value.name || value.filename || defaults.name || 'Migrated file',
    metadata: {
      ...(value.metadata || {}),
      bucketName,
      ...(defaults.mimeType ? { mimeType: defaults.mimeType } : {})
    },
    timestamp: value.timestamp || new Date(),
    bucketName,
    url: value.url || `/api/files/download/${stringId(fileId)}?bucket=${encodeURIComponent(bucketName)}`
  };
}

export function artifactDocumentForLegacyFile({ artifactId = new ObjectId(), attachment, type, lineage = {}, name = '' } = {}) {
  const normalized = normalizeLegacyFileAttachment(attachment, { type, name });
  if (!normalized || !lineage.organizationId) return null;
  const status = availableStatus('Existing file adopted by artifact migration');
  return {
    _id: artifactId,
    identity: { uid: artifactId, name: name || normalized.name, slug: `artifact-${stringId(artifactId)}`, serial: '', reference: '' },
    origin: status,
    status,
    lineage: { ...lineage },
    relations: {},
    provenance: {},
    attachments: { primary: normalized },
    data: { type, metadata: { migrated: true } }
  };
}

export function migrateGeometryCaptureArtifact(capture = {}, artifact = null) {
  if (!artifact?._id || capture.relations?.sourcePhoto?.id) return { changed: false, capture };
  const attachments = { ...(capture.attachments || {}) };
  delete attachments.primary;
  const data = { ...(capture.data || {}) };
  delete data.sourcePhotoId;
  delete data.photo;
  return {
    changed: true,
    capture: {
      ...capture,
      data,
      attachments,
      relations: {
        ...(capture.relations || {}),
        sourcePhoto: { type: 'artifact', id: stringId(artifact._id) }
      }
    }
  };
}

export function migrateStaticDxfArtifact(entity = {}, artifact = null) {
  if (!artifact?._id || entity.relations?.sourceDxf?.id) return { changed: false, entity };
  const data = { ...(entity.data || {}) };
  if (data.geometry?.dxfId) {
    data.geometry = { ...data.geometry };
    delete data.geometry.dxfId;
  }
  return {
    changed: true,
    entity: {
      ...entity,
      data,
      relations: {
        ...(entity.relations || {}),
        sourceDxf: { type: 'artifact', id: stringId(artifact._id) }
      }
    }
  };
}

function fileIdValues(value) {
  const values = [value, stringId(value), toFlexibleId(value)].filter(Boolean);
  return values.filter((item, index) => values.findIndex(candidate => (
    candidate?.toString?.() === item?.toString?.() && candidate?.constructor === item?.constructor
  )) === index);
}

async function findOrPlanArtifact(db, cache, { attachment, type, lineage, name }) {
  const normalized = normalizeLegacyFileAttachment(attachment, { type, name });
  if (!normalized) return null;
  const cacheKey = `${stringId(lineage.organizationId)}:${type}:${stringId(normalized.fileId)}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const existing = await db.collection('artifacts').findOne({
    'lineage.organizationId': lineage.organizationId,
    'attachments.primary.fileId': { $in: fileIdValues(normalized.fileId) },
    'data.type': type
  });
  const artifact = existing || artifactDocumentForLegacyFile({ attachment: normalized, type, lineage, name });
  if (artifact) cache.set(cacheKey, artifact);
  return artifact;
}

async function planCaptures(db, summary, plans, artifactCache) {
  const cursor = db.collection('geometry_captures').find({
    'relations.sourcePhoto': { $exists: false },
    'attachments.primary.fileId': { $exists: true }
  });
  for await (const capture of cursor) {
    summary.captures.scanned += 1;
    const artifact = await findOrPlanArtifact(db, artifactCache, {
      attachment: capture.attachments.primary,
      type: 'CAPTURE_PHOTO',
      lineage: capture.lineage || {},
      name: `${capture.identity?.name || 'Geometry capture'} source photo`
    });
    const result = migrateGeometryCaptureArtifact(capture, artifact);
    if (!result.changed) {
      summary.captures.invalid += 1;
      continue;
    }
    summary.captures.changed += 1;
    plans.push({
      artifact,
      writes: [{ collection: 'geometry_captures', id: capture._id, document: result.capture }]
    });
  }
}

async function planStaticDxfSources(db, summary, plans, artifactCache) {
  const cursor = db.collection('cassettes').find({ 'data.type': 'STANDARD' });
  for await (const cassette of cursor) {
    summary.dxf.scanned += 1;
    const design = await db.collection('cassette_designs').findOne({
      $or: [
        { 'lineage.templateId': cassette._id },
        {
          'provenance.derivedFrom.source.type': 'cassette',
          'provenance.derivedFrom.source.id': stringId(cassette._id)
        }
      ]
    });
    if (!design) {
      summary.dxf.invalid += 1;
      continue;
    }
    const cassetteArtifactId = cassette.relations?.sourceDxf?.id;
    const designArtifactId = design.relations?.sourceDxf?.id;
    if (cassetteArtifactId && designArtifactId && stringId(cassetteArtifactId) !== stringId(designArtifactId)) {
      summary.dxf.invalid += 1;
      continue;
    }
    const existingArtifactId = cassetteArtifactId || designArtifactId;
    const existingArtifact = existingArtifactId
      ? await db.collection('artifacts').findOne({ _id: toFlexibleId(existingArtifactId) })
      : null;
    const dxfId = design.data?.geometry?.dxfId;
    const artifact = existingArtifact || await findOrPlanArtifact(db, artifactCache, {
        attachment: { fileId: dxfId, bucketName: 'cassettes', name: `${cassette.identity?.name || 'Cassette'}.dxf` },
        type: 'DXF_SOURCE',
        lineage: cassette.lineage || {},
        name: `${cassette.identity?.name || 'Cassette'} source DXF`
      });
    if (!artifact) {
      summary.dxf.invalid += 1;
      continue;
    }
    const cassetteResult = migrateStaticDxfArtifact(cassette, artifact);
    const designResult = migrateStaticDxfArtifact(design, artifact);
    if (!cassetteResult.changed && !designResult.changed) continue;
    summary.dxf.changed += 1;
    plans.push({
      artifact,
      writes: [
        ...(cassetteResult.changed ? [{ collection: 'cassettes', id: cassette._id, document: cassetteResult.entity }] : []),
        ...(designResult.changed ? [{ collection: 'cassette_designs', id: design._id, document: designResult.entity }] : [])
      ]
    });
  }
}

async function assertTransactionSupport(db) {
  if (!db.client?.startSession) throw new Error('Apply mode requires MongoDB transaction support');
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection('artifacts').findOne({}, { session });
    });
  } finally {
    await session.endSession();
  }
}

async function applyPlan(db, plan) {
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      const { _id, ...artifactFields } = plan.artifact;
      await db.collection('artifacts').updateOne(
        { _id },
        { $setOnInsert: artifactFields },
        { upsert: true, session }
      );
      for (const write of plan.writes) {
        await db.collection(write.collection).replaceOne(
          { _id: write.id },
          write.document,
          { session }
        );
      }
    });
  } finally {
    await session.endSession();
  }
}

async function main() {
  const db = await connectDB();
  const summary = {
    captures: { scanned: 0, changed: 0, invalid: 0 },
    dxf: { scanned: 0, changed: 0, invalid: 0 }
  };
  const plans = [];
  const artifactCache = new Map();
  await planCaptures(db, summary, plans, artifactCache);
  await planStaticDxfSources(db, summary, plans, artifactCache);
  if (APPLY && !summary.captures.invalid && !summary.dxf.invalid) {
    await assertTransactionSupport(db);
    for (const plan of plans) await applyPlan(db, plan);
  }
  console.log(`${APPLY ? '[apply]' : '[dry-run]'} ${JSON.stringify(summary)}`);
  if (summary.captures.invalid || summary.dxf.invalid) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
