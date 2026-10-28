import { connectDB } from '~/server/db/mongo';
import { toFlexibleId } from '../../utils/objectid.js';
import { CLASS_COLLECTIONS } from '~/packages/cts/src/index.js';

// Per-class instance collections (SPEC §13) — the map's single home is
// @perigram/cts (`domain-projection.js`); this repository consumes it.
// Tenancy is the top-level `organizationId` slot (SPEC §3): `lineage`
// holds pure tree edges, and the wire DTO's `lineage.organizationId` is a
// boundary projection owned by the service, never storage.

export function collectionForClass(classOf = '') {
  return CLASS_COLLECTIONS[classOf] || 'files';
}

// Org scoping admits the system catalog (SPEC §3 system instances):
// pack-seeded reference rows carry `organizationId: null` and are
// read-visible to every organization; writes stamp the caller's org.
function orgFilter(organizationId) {
  if (!organizationId) return {};
  return { $or: [{ organizationId: toFlexibleId(organizationId) }, { organizationId: null }] };
}

export async function insertInstance(collection, doc) {
  const db = await connectDB();
  await db.collection(collection).insertOne(doc);
  return doc;
}

export async function listInstances(collection, typeId, organizationId, limit = 200, filter = {}) {
  const db = await connectDB();
  return await db.collection(collection)
    .find({ type: typeId, ...orgFilter(organizationId), ...filter })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

export async function findInstance(collection, id, typeId = null) {
  const db = await connectDB();
  const filter = { _id: toFlexibleId(id) };
  if (typeId) filter.type = typeId;
  return await db.collection(collection).findOne(filter);
}

export async function findInstanceAnywhere(id, typeId) {
  const db = await connectDB();
  for (const collection of Object.values(CLASS_COLLECTIONS)) {
    const doc = await findInstance(collection, id, typeId);
    if (doc) return doc;
  }
  return null;
}

export async function updateInstanceFields(collection, id, set) {
  const db = await connectDB();
  return await db.collection(collection).findOneAndUpdate(
    { _id: toFlexibleId(id) },
    { $set: { ...set, updatedAt: new Date().toISOString() } },
    { returnDocument: 'after' }
  );
}

export async function deleteInstance(collection, id) {
  const db = await connectDB();
  const result = await db.collection(collection).deleteOne({ _id: toFlexibleId(id) });
  return result.deletedCount > 0;
}

// Unbounded raw-filter scan (the remove path's referrer sweep).
export async function findInstancesByFilter(collection, filter = {}) {
  const db = await connectDB();
  return await db.collection(collection).find(filter).toArray();
}
