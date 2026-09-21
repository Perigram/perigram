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

export async function deleteForSource(typeId, entityId) {
  const db = await connectDB();
  const id = toFlexibleId(entityId).toString();
  const filter = {
    $or: [
      { 'data.source.type': typeId, 'data.source.id': id },
      { 'data.typeId': typeId, 'data.entityId': id }
    ]
  };
  const revisions = await db.collection(COLLECTION).find(filter).toArray();
  await db.collection(COLLECTION).deleteMany(filter);
  return revisions;
}

export async function findByHash(typeId, entityId, scope, contentHash) {
  const db = await connectDB();
  const id = toFlexibleId(entityId).toString();
  return await db.collection(COLLECTION).findOne({
    $or: [
      { 'data.source.type': typeId, 'data.source.id': id },
      { 'data.typeId': typeId, 'data.entityId': id }
    ],
    'data.scope': scope,
    'data.contentHash': contentHash
  });
}

export async function findLatest(typeId, entityId, scope) {
  const db = await connectDB();
  const id = toFlexibleId(entityId).toString();
  return await db.collection(COLLECTION)
    .find({
      $or: [
        { 'data.source.type': typeId, 'data.source.id': id },
        { 'data.typeId': typeId, 'data.entityId': id }
      ],
      'data.scope': scope
    })
    .sort({ 'data.number': -1, _id: -1 })
    .limit(1)
    .next();
}

export async function ensureIndexes() {
  const db = await connectDB();
  const collection = db.collection(COLLECTION);
  await ensureIndex(collection, {
    'data.source.type': 1,
    'data.source.id': 1,
    'data.scope': 1,
    'data.contentHash': 1
  }, { unique: true, name: 'entity_revision_content_hash' });
  await ensureIndex(collection, {
    'data.source.type': 1,
    'data.source.id': 1,
    'data.scope': 1,
    'data.number': -1
  }, { name: 'entity_revision_latest' });
}

async function ensureIndex(collection, key, options = {}) {
  // On a fresh database the collection (namespace) does not exist yet and
  // listIndexes fails with NamespaceNotFound (code 26) — that means no
  // indexes exist, not an error.
  let existing;
  try {
    existing = await collection.indexes();
  } catch (error) {
    if (error?.code !== 26 && !/ns does not exist/.test(error?.message || '')) throw error;
    existing = [];
  }
  const current = existing.find(index => index.name === options.name);
  if (current && !sameIndexKey(current.key, key)) {
    await collection.dropIndex(options.name);
  }
  await collection.createIndex(key, options);
}

function sameIndexKey(left = {}, right = {}) {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  if (leftEntries.length !== rightEntries.length) return false;
  return leftEntries.every(([key, value], index) => (
    key === rightEntries[index]?.[0] && value === rightEntries[index]?.[1]
  ));
}
