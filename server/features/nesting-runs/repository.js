import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';

const COLLECTION = 'nesting_runs';

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

export async function count(filter = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).countDocuments(filter);
}

export async function updateById(uid, updates) {
  const db = await connectDB();
  const flexId = toFlexibleId(uid);
  const { _id, ...clean } = updates;
  await db.collection(COLLECTION).updateOne(
    { _id: flexId }, 
    { $set: clean }
  );
  return await findById(uid);
}

export async function deleteById(uid) {
  const db = await connectDB();
  const flexId = toFlexibleId(uid);
  return await db.collection(COLLECTION).deleteOne({ _id: flexId });
}

export async function findRunsByPrimaryState(queueId, primaryState, excludeRunId = null) {
  const db = await connectDB();
  const flexibleQueueId = toFlexibleId(queueId);
  const filter = {
    'lineage.queueId': { $in: [flexibleQueueId, queueId?.toString()] },
    'status.state.primary': primaryState
  };

  if (excludeRunId !== null && excludeRunId !== undefined) {
    filter._id = { $ne: toFlexibleId(excludeRunId) };
  }

  return await db.collection(COLLECTION).find(filter).toArray();
}
