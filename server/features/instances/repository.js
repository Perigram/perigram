import { ObjectId } from 'mongodb';
import { connectDB } from '~/server/db/mongo';
import { toFlexibleId } from '../../utils/objectid.js';
import { CLASS_COLLECTIONS } from '~/packages/cts/src/index.js';

// Per-class instance collections (SPEC §13) — the map's single home is
// @perigram/cts (`domain-projection.js`); this repository consumes it.

export function collectionForClass(classOf = '') {
  return CLASS_COLLECTIONS[classOf] || 'files';
}

function orgFilter(organizationId) {
  return organizationId ? { 'lineage.organizationId': toFlexibleId(organizationId) } : {};
}

export async function insertInstance(collection, doc) {
  const db = await connectDB();
  await db.collection(collection).insertOne(doc);
  return doc;
}

export async function listInstances(collection, typeId, organizationId, limit = 200) {
  const db = await connectDB();
  return await db.collection(collection)
    .find({ type: typeId, ...orgFilter(organizationId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

export async function findInstance(collection, id, typeId = null) {
  const db = await connectDB();
  const filter = { _id: new ObjectId(String(id)) };
  if (typeId) filter.type = typeId;
  return await db.collection(collection).findOne(filter);
}

export async function findInstanceAnywhere(id, typeId) {
  const db = await connectDB();
  for (const collection of Object.values(CLASS_COLLECTIONS)) {
    const doc = await db.collection(collection).findOne({ _id: new ObjectId(String(id)), type: typeId });
    if (doc) return doc;
  }
  return null;
}

export async function updateInstanceBlocks(collection, id, blocks) {
  const db = await connectDB();
  return await db.collection(collection).findOneAndUpdate(
    { _id: new ObjectId(String(id)) },
    { $set: { ...blocks, updatedAt: new Date().toISOString() } },
    { returnDocument: 'after' }
  );
}

export async function deleteInstance(collection, id) {
  const db = await connectDB();
  const result = await db.collection(collection).deleteOne({ _id: new ObjectId(String(id)) });
  return result.deletedCount > 0;
}
