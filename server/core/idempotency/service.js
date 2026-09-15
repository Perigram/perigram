import { connectDB } from '../../db/mongo.js';

const COLLECTION = 'idempotency_keys';

export async function findExecutedKey(key) {
  if (!key) return null;
  const db = await connectDB();
  return db.collection(COLLECTION).findOne({ key });
}

export async function registerExecutedKey({ key, userId = null, method, url }) {
  if (!key) return;
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
    if (error?.code !== 11000) throw error;
  }
}
