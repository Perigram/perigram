/**
 * Pen Templates Repository
 */

import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';

import { toFlexibleId } from '../../utils/objectid.js';
const COLLECTION = 'pen_templates';

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toFlexibleId(id) });
}

export async function findSystem() {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find({ 'lineage.userId': null })
    .sort({ 'identity.name': 1 })
    .toArray();
}

export async function findByOwner(ownerId) {
  if (!ownerId) {
    return [];
  }
  
  const db = await connectDB();
  
  // Handle OAuth userId strings (e.g., "google:12345") - use as-is, not as ObjectId
  return await db.collection(COLLECTION)
    .find({ 'lineage.userId': ownerId })
    .sort({ 'identity.name': 1 })
    .toArray();
}

export async function create(data) {
  const db = await connectDB();
  const doc = {
    ...data,
    _id: data._id || new ObjectId()
  };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function updateById(id, updates) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).updateOne(
    { _id: toFlexibleId(id) },
    { $set: updates }
  );
  return result.modifiedCount > 0;
}

export async function deleteById(id) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).deleteOne({ _id: toFlexibleId(id) });
  return result.deletedCount > 0;
}
