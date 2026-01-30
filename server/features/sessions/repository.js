import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'sessions';

export async function create(sessionData) {
  const db = await connectDB();
  await db.collection(COLLECTION).insertOne(sessionData);
  return sessionData;
}

export async function findBySessionId(sessionId) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({
    sessionId,
    expiresAt: { $gt: new Date() }
  });
}

export async function deleteBySessionId(sessionId) {
  const db = await connectDB();
  await db.collection(COLLECTION).deleteOne({ sessionId });
}

export async function deleteByUserId(userId) {
  const db = await connectDB();
  const filter = {};
  if (ObjectId.isValid(userId)) {
    filter.userId = new ObjectId(userId);
  } else {
    filter.userId = userId;
  }
  await db.collection(COLLECTION).deleteMany(filter);
}

export async function deleteExpired() {
  const db = await connectDB();
  await db.collection(COLLECTION).deleteMany({
    expiresAt: { $lte: new Date() }
  });
}