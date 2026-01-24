/**
 * Layer Standards Repository - v24 Standardized
 */

import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { toObjectId } from '../../utils/objectid.js';

const COLLECTION = 'layer_standards';

export async function find(filter = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).find(filter).toArray();
}

export async function findByCode(code) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ 'config.code': code });
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toObjectId(id) });
}

export async function create(data) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).insertOne(data);
  return { ...data, _id: result.insertedId };
}

export async function bulkCreate(docs) {
  const db = await connectDB();
  return await db.collection(COLLECTION).insertMany(docs);
}

export async function updateById(id, updates) {
  const db = await connectDB();
  const { _id, identity, lineage, ...clean } = updates;
  return await db.collection(COLLECTION).updateOne({ _id: toObjectId(id) }, { $set: clean });
}

export async function deleteById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ _id: toObjectId(id) });
}
