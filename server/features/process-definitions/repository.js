import { ObjectId } from 'mongodb';
import { connectDB } from '~/server/db/mongo.js';
import { toFlexibleId } from '~/server/utils/objectid.js';

const COLLECTION = 'process_definitions';

export async function getConnection() {
  return connectDB();
}

export async function create(data) {
  const db = await connectDB();
  const doc = {
    ...(data.toJSON ? data.toJSON() : data),
    _id: data._id || new ObjectId()
  };
  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toFlexibleId(id) });
}

export async function find(filter = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).find(filter).sort({ 'identity.name': 1 }).toArray();
}

export async function findActiveSetByOrganization(organizationId) {
  const db = await connectDB();
  return await db.collection(COLLECTION).find({
    'lineage.organizationId': toFlexibleId(organizationId),
    'states.main': 'ACTIVE'
  }).sort({ 'status.timestamp': 1, _id: 1 }).toArray();
}

// The most recently activated definition — the boot convenience behind
// `/active`; the runtime contract itself compiles the whole active set.
export async function findActiveByOrganization(organizationId) {
  const set = await findActiveSetByOrganization(organizationId);
  return set[set.length - 1] || null;
}

export async function updateById(id, updates) {
  const db = await connectDB();
  const clean = updates.toJSON ? updates.toJSON() : { ...updates };
  delete clean._id;
  await db.collection(COLLECTION).updateOne({ _id: toFlexibleId(id) }, { $set: clean });
  return await findById(id);
}

export async function removeById(id) {
  const db = await connectDB();
  await db.collection(COLLECTION).deleteOne({ _id: toFlexibleId(id) });
}

