import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';

const COLLECTION = 'entity_revisions';

export async function create(data) {
  const db = await connectDB();
  const doc = {
    ...data,
    _id: data.identity?.uid || data._id
  };
  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toFlexibleId(id) });
}

export async function find(filter = {}, options = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find(filter)
    .sort(options.sort || { 'data.number': -1, _id: -1 })
    .limit(options.limit || 100)
    .skip(options.skip || 0)
    .toArray();
}

export async function findByHash(entityType, entityId, scope, contentHash) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({
    'data.source.type': entityType,
    'data.source.id': toFlexibleId(entityId).toString(),
    'data.scope': scope,
    'data.contentHash': contentHash
  });
}

export async function findLatest(entityType, entityId, scope) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find({
      'data.source.type': entityType,
      'data.source.id': toFlexibleId(entityId).toString(),
      'data.scope': scope
    })
    .sort({ 'data.number': -1, _id: -1 })
    .limit(1)
    .next();
}

export async function ensureIndexes() {
  const db = await connectDB();
  await db.collection(COLLECTION).createIndex(
    {
      'data.source.type': 1,
      'data.source.id': 1,
      'data.scope': 1,
      'data.contentHash': 1
    },
    { unique: true, name: 'entity_revision_content_hash' }
  );
  await db.collection(COLLECTION).createIndex(
    {
      'data.source.type': 1,
      'data.source.id': 1,
      'data.scope': 1,
      'data.number': -1
    },
    { name: 'entity_revision_latest' }
  );
}
