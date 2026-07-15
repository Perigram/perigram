import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';

const COLLECTION = 'queues';

export async function create(data) {
  const db = await connectDB();
  const doc = {
    ...data,
    _id: data.identity.uid
  };
  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

export async function findById(uid) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toFlexibleId(uid) });
}

export async function find(filter = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).find(filter).toArray();
}

export async function updateById(uid, updates) {
  const db = await connectDB();
  const { _id, ...clean } = updates;
  await db.collection(COLLECTION).updateOne(
    { _id: toFlexibleId(uid) }, 
    { $set: clean }
  );
  return await findById(uid);
}

export async function getNextQueueNumber({ projectId = null, organizationId = null } = {}) {
  const db = await connectDB();
  const filter = projectId
    ? { 'lineage.project.entityId': String(projectId) }
    : { 'lineage.organization.entityId': String(organizationId), 'lineage.project.entityId': { $exists: false } };
  return await db.collection(COLLECTION).countDocuments(filter) + 1;
}

export async function deleteById(uid) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ _id: toFlexibleId(uid) });
}
