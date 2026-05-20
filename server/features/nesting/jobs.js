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
