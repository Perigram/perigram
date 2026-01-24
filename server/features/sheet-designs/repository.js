/**
 * Sheet Designs Repository
 */

import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';

const COLLECTION = 'sheet_designs';

export async function create(data) {
  const db = await connectDB();
  const doc = { ...data, createdAt: new Date(), updatedAt: new Date() };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { _id: result.insertedId, ...doc };
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}
