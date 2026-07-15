import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import { connectDB } from '../db/mongo.js';
import { toFlexibleId } from '../utils/objectid.js';

const REVISION_COLLECTION = 'entity_revisions';
const GEOMETRY_SCOPE = 'geometry';
const APPLY = process.argv.includes('--apply');

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
      'data.source.type': 1,
      'data.source.id': 1,
      'data.scope': 1,
      'data.contentHash': 1
    },
    { unique: true, name: 'entity_revision_content_hash' }
  );
  await db.collection(REVISION_COLLECTION).createIndex(
    {
      'data.source.type': 1,
      'data.source.id': 1,
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
    'data.source.type': 'cassette',
    'data.source.id': entityId.toString(),
    'data.scope': GEOMETRY_SCOPE,
    'data.contentHash': contentHash
  });

  if (existing) return existing;

  const latest = await db.collection(REVISION_COLLECTION)
    .find({
      'data.source.type': 'cassette',
      'data.source.id': entityId.toString(),
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
      source: { type: 'cassette', id: entityId.toString() },
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
    if (APPLY) await db.collection(REVISION_COLLECTION).insertOne(revision);
    return revision;
  } catch (error) {
    if (error?.code === 11000) {
      return await db.collection(REVISION_COLLECTION).findOne({
        'data.source.type': 'cassette',
        'data.source.id': entityId.toString(),
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

    if (APPLY) await db.collection('cassettes').updateOne(
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
      'lineage.templateId': { $exists: true, $ne: null }
    })
    .toArray();

  const summary = { scanned: designs.length, provenanceBackfilled: 0, lineageRemoved: 0, invalid: 0 };
  for (const design of designs) {
    const templateId = design.lineage?.templateId;
    const existing = design.provenance?.derivedFrom;
    if (existing?.source && (
      existing.source.type !== 'cassette' ||
      existing.source.id?.toString?.() !== templateId?.toString?.()
    )) {
      summary.invalid += 1;
      continue;
    }
    const revision = existing ? null : revisionsByTemplateId.get(templateId?.toString?.() || templateId);
    if (!existing && !revision) {
      summary.invalid += 1;
      continue;
    }

    if (APPLY) {
      const update = { $unset: { 'lineage.templateId': '' } };
      if (!existing) {
        update.$set = {
          'provenance.derivedFrom': {
              source: {
                type: revision.data.source.type,
                id: revision.data.source.id,
                revisionId: revision._id.toString()
              },
              scope: revision.data.scope,
              revisionNumber: revision.data.number,
              contentHash: revision.data.contentHash,
              sourceStatus: revision.data.sourceStatus || null,
              parameters: design.data?.parameters || {},
              migration: {
                inferred: true,
                note: 'Backfilled from current template geometry revision because historical design source revision was not recorded.'
              }
            }
        };
      }
      await db.collection('cassette_designs').updateOne(
        { _id: toFlexibleId(design._id) },
        update
      );
    }
    if (!existing) summary.provenanceBackfilled += 1;
    summary.lineageRemoved += 1;
  }

  return summary;
}

async function main() {
  const db = await connectDB();
  if (APPLY) await ensureIndexes(db);
  const revisionsByTemplateId = await migrateCassetteTemplateRevisions(db);
  const designSummary = await migrateCassetteDesignDerivedFrom(db, revisionsByTemplateId);

  console.log(`${APPLY ? '[apply]' : '[dry-run]'} Cassette template geometry revisions ensured: ${revisionsByTemplateId.size}`);
  console.log(`${APPLY ? '[apply]' : '[dry-run]'} Cassette design derivation migration: ${JSON.stringify(designSummary)}`);
  if (designSummary.invalid) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  process.exit();
});
