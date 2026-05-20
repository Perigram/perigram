import { ObjectId } from 'mongodb';
import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';

const COLLECTION = 'service_action_runs';

export async function create(run) {
  const db = await connectDB();
  const doc = {
    ...run,
    _id: run._id || new ObjectId(),
    createdAt: run.createdAt || new Date(),
    updatedAt: run.updatedAt || new Date()
  };
  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

export async function updateById(id, updates) {
  const db = await connectDB();
  await db.collection(COLLECTION).updateOne(
    { _id: toFlexibleId(id) },
    { $set: { ...updates, updatedAt: new Date() } }
  );
  return findById(id);
}

export async function findById(id) {
  const db = await connectDB();
  return db.collection(COLLECTION).findOne({ _id: toFlexibleId(id) });
}

export async function list({ actionId, limit = 50 } = {}) {
  const db = await connectDB();
  const filter = actionId ? { actionId } : {};
  return db.collection(COLLECTION)
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 50, 100))
    .toArray();
}
