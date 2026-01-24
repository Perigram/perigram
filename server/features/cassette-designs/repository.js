/**
 * Cassette Designs Repository
 * Design data separated from instances
 */

import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';

const COLLECTION = 'cassette_designs';

export async function create(data) {
  const db = await connectDB();
  const doc = {
    ...data,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { _id: result.insertedId, ...doc };
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

export async function findByOwner(ownerId, options = {}) {
  const db = await connectDB();
  const { limit = 100, skip = 0 } = options;
  return await db.collection(COLLECTION)
    .find({ ownerId })
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();
}

export async function update(id, data) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { ...data, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  return result.value;
}

export async function deleteById(id) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount;
}
