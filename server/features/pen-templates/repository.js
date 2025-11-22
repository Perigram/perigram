/**
 * Pen Templates Repository
 */

import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';

import { toObjectId } from '../../utils/objectid.js';
const COLLECTION = 'pen_templates';

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toObjectId(id) });
}

export async function findSystem() {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find({ ownerId: null })
    .sort({ name: 1 })
    .toArray();
}

export async function findByOwner(ownerId) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find({ ownerId: toObjectId(ownerId) })
    .sort({ name: 1 })
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
    { _id: toObjectId(id) },
    { $set: updates }
  );
  return result.modifiedCount > 0;
}

export async function deleteById(id) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).deleteOne({ _id: toObjectId(id) });
  return result.deletedCount > 0;
}
