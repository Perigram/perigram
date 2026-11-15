import { connectDB } from '../../db/mongo.js';

const COLLECTION = 'idempotency_keys';

export async function findByKey(key) {
  const db = await connectDB();
  return db.collection(COLLECTION).findOne({ key });
}

export async function registerKey({ key, userId = null, method, url } = {}) {
  const db = await connectDB();
  try {
    await db.collection(COLLECTION).insertOne({
      key,
      userId,
      method,
      url,
      createdAt: new Date()
    });
  } catch (error) {
    // A concurrent successful response may register the same key first.
    // The unique index is the final arbiter; duplicate registration is
    // an idempotent success, every other persistence error still surfaces.
    if (error?.code !== 11000) throw error;
  }
}
