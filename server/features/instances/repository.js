import { connectDB } from '~/server/db/mongo';
import { toFlexibleId } from '../../utils/objectid.js';
import { CLASS_COLLECTIONS } from '#packages/cts';

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


// Bounded deadline scan for one declared type and organization. The scanner
// owns scheduling policy; this repository owns collection/query mechanics.
export async function findOverdueInstances(collection, typeId, organizationId, statePath, cutoff, limit = 200) {
  const db = await connectDB();
  const orgId = toFlexibleId(organizationId);
  return db.collection(collection).find({
    type: typeId,
    $and: [
      { $or: [{ organizationId: orgId }, { 'lineage.organizationId': orgId }] },
      {
        $or: [
          { state: statePath, stateChangedAt: { $lt: cutoff.toISOString() } },
          { 'status.state.primary': statePath, 'status.timestamp': { $lt: cutoff } }
        ]
      }
    ]
  }).project({ _id: 1 }).limit(limit).toArray();
}


// Type migrations are feature-owned orchestration over instance storage.
// Keep cursor creation and mutation mechanics here, while the migration
// service owns the transform, event publication, and resumability policy.
export async function* iterateInstancesForTypeMigration(collection, typeId, organizationId, toVersion) {
  const db = await connectDB();
  const cursor = db.collection(collection).find({
    type: typeId,
    organizationId: toFlexibleId(organizationId),
    typeVersion: { $ne: toVersion }
  });
  for await (const doc of cursor) yield doc;
}

export async function* iterateChildrenWithLineageKey(collection, childType, organizationId, lineageKey) {
  const db = await connectDB();
  const cursor = db.collection(collection).find({
    type: childType,
    organizationId: toFlexibleId(organizationId),
    [`lineage.${lineageKey}`]: { $exists: true }
  });
  for await (const doc of cursor) yield doc;
}

export async function detachMigratedLineageKey(collection, id, lineageKey) {
  const db = await connectDB();
  return db.collection(collection).updateOne(
    { _id: toFlexibleId(id) },
    { $unset: { [`lineage.${lineageKey}`]: '' }, $set: { updatedAt: new Date().toISOString() } }
  );
}

export async function updateMigratedInstance(collection, id, set) {
  const db = await connectDB();
  return db.collection(collection).updateOne(
    { _id: toFlexibleId(id) },
    { $set: set }
  );
}
