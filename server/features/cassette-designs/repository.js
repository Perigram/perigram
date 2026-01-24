/**
 * Cassette Designs Repository - Functional Data Only
 */

import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';

const COLLECTION = 'cassette_designs';

export async function create(data) {
  const db = await connectDB();
  const doc = {
    name: data.name,
    cassetteTemplateId: data.cassetteTemplateId ? new ObjectId(data.cassetteTemplateId) : null,
    projectId: data.projectId ? new ObjectId(data.projectId) : null,
    queueId: data.queueId ? new ObjectId(data.queueId) : null,
    parameters: data.parameters || {}, // Values for parametric designs
    geometry: data.geometry || {}, // Flattened geometry
    metadata: data.metadata || {}
  };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { _id: result.insertedId, ...doc };
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

export async function find(filter = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).find(filter).toArray();
}

export async function update(id, updates) {
  const db = await connectDB();
  const { _id, createdAt, updatedAt, ownerId, ...clean } = updates;
  const result = await db.collection(COLLECTION).findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: clean },
    { returnDocument: 'after' }
  );
  return result.value;
}

export async function deleteById(id) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount;
}