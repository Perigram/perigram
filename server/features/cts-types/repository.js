import { ObjectId } from 'mongodb';
import { connectDB } from '~/server/db/mongo';
import { toFlexibleId } from '../../utils/objectid.js';

// Organization-authored CTS type declarations (SPEC §4 tenancy, §13 storage):
// one `cts_types` collection; system types are NOT stored here — they are
// compiled from the domain packs at runtime.
const COLLECTION = 'cts_types';

function orgFilter(organizationId) {
  return { scope: 'org', organizationId: String(organizationId) };
}

export async function create(data) {
  const db = await connectDB();
  const doc = {
    ...data,
    _id: data._id || new ObjectId()
  };
  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

export async function findByTypeId(organizationId, typeId) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({
    ...orgFilter(organizationId),
    id: String(typeId)
  });
}

export async function listByOrganization(organizationId) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find(orgFilter(organizationId))
    .sort({ id: 1 })
    .toArray();
}

export async function upsertByTypeId(organizationId, typeId, data) {
  const db = await connectDB();
  // identity fields are immutable: they live in the filter and $setOnInsert
  // only — repeating them in $set makes Mongo reject the update ("would
  // create a conflict at 'scope'").
  const { _id, scope, organizationId: dataOrg, id, ...clean } = data;
  await db.collection(COLLECTION).updateOne(
    { ...orgFilter(organizationId), id: String(typeId) },
    { $set: clean, $setOnInsert: { _id: new ObjectId(), scope: 'org', organizationId: String(organizationId), id: String(typeId) } },
    { upsert: true }
  );
  return await findByTypeId(organizationId, typeId);
}

export async function deleteByTypeId(organizationId, typeId) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).deleteOne({
    ...orgFilter(organizationId),
    id: String(typeId)
  });
  return result.deletedCount > 0;
}
