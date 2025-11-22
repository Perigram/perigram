/**
 * Tool Profiles Repository
 */

import { connectDB } from '~~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'tool_profiles';

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

export async function findSystem() {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find({ ownerId: null })
    .sort({ diameter: 1 })
    .toArray();
}

export async function findByOwner(ownerId) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find({ ownerId: new ObjectId(ownerId) })
    .sort({ diameter: 1 })
    .toArray();
}

export async function create(data) {
  const db = await connectDB();
  const doc = { ...data, createdAt: new Date() };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function updateById(id, updates) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { $set: updates }
  );
  return result.modifiedCount > 0;
}

export async function deleteById(id) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}
