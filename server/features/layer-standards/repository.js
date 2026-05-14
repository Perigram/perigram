import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { toFlexibleId } from '../../utils/objectid.js';

const COLLECTION = 'layer_standards';

export async function create(data) {
  const db = await connectDB();
  const doc = {
    ...data,
    _id: data._id || new ObjectId()
  };
  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

export async function bulkCreate(docs) {
  const db = await connectDB();
  const prepared = docs.map(d => ({
    ...d,
    _id: d._id || new ObjectId()
  }));
  await db.collection(COLLECTION).insertMany(prepared);
  return prepared;
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toFlexibleId(id) });
}

export async function findByCode(code) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ 'data.code': code });
}

export async function find(filter = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).find(filter).toArray();
}

export async function count(filter = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).countDocuments(filter);
}

export async function updateById(id, updates) {
  const db = await connectDB();
  const { _id, ...clean } = updates;
  await db.collection(COLLECTION).updateOne(
    { _id: toFlexibleId(id) }, 
    { $set: clean }
  );
  return await findById(id);
}

export async function deleteById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ _id: toFlexibleId(id) });
}
// --- Org-level pen overrides ---
const OVERRIDES_COLLECTION = 'layer_standard_overrides';

export async function findOverridesByOrg(organizationId) {
  const db = await connectDB();
  return await db.collection(OVERRIDES_COLLECTION)
    .find({ organizationId: toFlexibleId(organizationId) })
    .toArray();
}

export async function upsertOverride(organizationId, standardId, penId) {
  const db = await connectDB();
  await db.collection(OVERRIDES_COLLECTION).updateOne(
    { organizationId: toFlexibleId(organizationId), standardId: toFlexibleId(standardId) },
    { $set: { penId: toFlexibleId(penId), updatedAt: new Date() } },
    { upsert: true }
  );
}

export async function deleteOverride(organizationId, standardId) {
  const db = await connectDB();
  await db.collection(OVERRIDES_COLLECTION).deleteOne({
    organizationId: toFlexibleId(organizationId),
    standardId: toFlexibleId(standardId)
  });
}
