import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDB } from '../db/mongo.js';
import { toFlexibleId } from '../utils/objectid.js';

const REVISION_COLLECTION = 'entity_revisions';
const GEOMETRY_SCOPE = 'geometry';

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object' || value instanceof Date || value instanceof ObjectId) return value;
  return Object.keys(value).sort().reduce((result, key) => {
    const next = value[key];
    if (next !== undefined) result[key] = sortValue(next);
    return result;
  }, {});
}

function hashContent(content) {
  return `sha256:${crypto
    .createHash('sha256')
    .update(JSON.stringify(sortValue(content)))
    .digest('hex')}`;
}

function status(userId, note) {
  return {
    state: 'ACTIVE',
    userId,
    timestamp: new Date(),
    metadata: { note },
    eventId: null,
    lifecycle: { actors: [], attachments: {}, data: {} }
  };
}

function revisionContent(cassette) {
  const data = cassette.data || {};
  return {
    type: data.type || 'PARAMETRIC',
    definition: data.definition || null,
    parameters: data.parameters || []
  };
}

function revisionPointer(revision) {
  return {
    currentId: revision._id,
    number: revision.data?.number || 0,
    contentHash: revision.data?.contentHash || ''
  };
}

async function ensureIndexes(db) {
  await db.collection(REVISION_COLLECTION).createIndex(
    {
      'data.entityType': 1,
      'data.entityId': 1,
      'data.scope': 1,
      'data.contentHash': 1
    },
    { unique: true, name: 'entity_revision_content_hash' }
  );
  await db.collection(REVISION_COLLECTION).createIndex(
    {
      'data.entityType': 1,
      'data.entityId': 1,
      'data.scope': 1,
      'data.number': -1
    },
    { name: 'entity_revision_latest' }
  );
}

async function ensureCassetteGeometryRevision(db, cassette) {
  const entityId = toFlexibleId(cassette._id);
  const content = revisionContent(cassette);
  const contentHash = hashContent(content);
  const existing = await db.collection(REVISION_COLLECTION).findOne({
    'data.entityType': 'cassette',
    'data.entityId': entityId,
    'data.scope': GEOMETRY_SCOPE,
    'data.contentHash': contentHash
  });

  if (existing) return existing;

  const latest = await db.collection(REVISION_COLLECTION)
    .find({
      'data.entityType': 'cassette',
      'data.entityId': entityId,
      'data.scope': GEOMETRY_SCOPE
    })
    .sort({ 'data.number': -1, _id: -1 })
    .limit(1)
    .next();

  const revisionId = new ObjectId();
  const number = Number(latest?.data?.number || 0) + 1;
  const origin = status('SYSTEM', 'Entity revision created');
  const revision = {
    _id: revisionId,
    identity: {
      uid: revisionId,
      name: `cassette geometry v${number}`,
      slug: '',
      serial: '',
      reference: ''
    },
    origin,
    status: origin,
    lineage: {
      ...(cassette.lineage || {}),
      cassetteId: entityId
    },
    data: {
      entityType: 'cassette',
      entityId,
      scope: GEOMETRY_SCOPE,
      number,
      contentHash,
      snapshot: {
        identity: cassette.identity || null,
        data: content
      },
      sourceStatus: cassette.status || null,
      reason: 'migration'
    }
  };

  try {
    await db.collection(REVISION_COLLECTION).insertOne(revision);
    return revision;
  } catch (error) {
    if (error?.code === 11000) {
      return await db.collection(REVISION_COLLECTION).findOne({
        'data.entityType': 'cassette',
        'data.entityId': entityId,
        'data.scope': GEOMETRY_SCOPE,
        'data.contentHash': contentHash
      });
    }
    throw error;
  }
}

async function migrateCassetteTemplateRevisions(db) {
  const cassettes = await db.collection('cassettes').find({}).toArray();
  const revisionsByTemplateId = new Map();

  for (const cassette of cassettes) {
    const revision = await ensureCassetteGeometryRevision(db, cassette);
    revisionsByTemplateId.set(cassette._id.toString(), revision);

    await db.collection('cassettes').updateOne(
      { _id: toFlexibleId(cassette._id) },
      {
        $set: {
          'data.revisions.geometry': revisionPointer(revision)
        }
      }
    );
  }

  return revisionsByTemplateId;
}

async function migrateCassetteDesignDerivedFrom(db, revisionsByTemplateId) {
  const designs = await db.collection('cassette_designs')
    .find({
      'data.derivedFrom': { $exists: false },
      'lineage.templateId': { $exists: true, $ne: null }
    })
    .toArray();

  let updated = 0;
  for (const design of designs) {
    const templateId = design.lineage?.templateId;
    const revision = revisionsByTemplateId.get(templateId?.toString?.() || templateId);
    if (!revision) continue;

    await db.collection('cassette_designs').updateOne(
      { _id: toFlexibleId(design._id) },
      {
        $set: {
          'data.derivedFrom': {
            entityType: revision.data.entityType,
            entityId: revision.data.entityId,
            scope: revision.data.scope,
            revisionId: revision._id,
            revisionNumber: revision.data.number,
            contentHash: revision.data.contentHash,
            sourceStatus: revision.data.sourceStatus || null,
            parameters: design.data?.parameters || {},
            migration: {
              inferred: true,
              note: 'Backfilled from current template geometry revision because historical design source revision was not recorded.'
            }
          }
        }
      }
    );
    updated += 1;
  }

  return updated;
}

async function main() {
  const db = await connectDB();
  await ensureIndexes(db);
  const revisionsByTemplateId = await migrateCassetteTemplateRevisions(db);
  const designCount = await migrateCassetteDesignDerivedFrom(db, revisionsByTemplateId);

  console.log(`Cassette template geometry revisions ensured: ${revisionsByTemplateId.size}`);
  console.log(`Cassette design derivedFrom records backfilled: ${designCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  process.exit();
});
