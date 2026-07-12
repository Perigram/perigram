import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';

const COLLECTION = 'nesting_jobs';

export async function findActiveByQueue(queueId) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({
    queueId: toFlexibleId(queueId),
    status: { $in: ['pending', 'processing'] }
  });
}

export async function create(job) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).insertOne(job);
  return { ...job, _id: result.insertedId };
}

export async function updateById(id, update) {
  const db = await connectDB();
  await db.collection(COLLECTION).updateOne(
    { _id: toFlexibleId(id) },
    { $set: { ...update, updatedAt: new Date() } }
  );
  return await db.collection(COLLECTION).findOne({ _id: toFlexibleId(id) });
}

export async function findLatestByRun(runId) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find({ runId: toFlexibleId(runId) })
    .sort({ createdAt: -1, startedAt: -1 })
    .limit(1)
    .next();
}
