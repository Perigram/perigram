/**
 * Batches Repository
 */

import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';

const COLLECTION = 'batches';

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

export async function findByProject(projectSlug, options = {}) {
  const db = await connectDB();
  const { status, limit = 100, skip = 0 } = options;
  
  const query = { projectSlug };
  if (status) query.status = status;
  
  return await db.collection(COLLECTION)
    .find(query)
    .sort({ batchNumber: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();
}

export async function findByOwner(ownerId, options = {}) {
  const db = await connectDB();
  const { limit = 100, skip = 0 } = options;
  
  return await db.collection(COLLECTION)
    .find({ ownerId: new ObjectId(ownerId) })
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();
}

export async function getNextBatchNumber(projectSlug) {
  const db = await connectDB();
  const lastBatch = await db.collection(COLLECTION)
    .findOne({ projectSlug }, { sort: { batchNumber: -1 } });
  
  return lastBatch ? lastBatch.batchNumber + 1 : 1;
}

export async function create(data) {
  const db = await connectDB();
  const doc = {
    ...data,
    status: 'DRAFT',
    artifacts: [],
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function updateById(id, updates) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { 
      $set: { 
        ...updates, 
        updatedAt: new Date() 
      } 
    }
  );
  return result.modifiedCount > 0;
}

export async function deleteById(id) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

export async function addArtifact(id, artifactId) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { 
      $push: { artifacts: new ObjectId(artifactId) },
      $set: { updatedAt: new Date() }
    }
  );
  return result.modifiedCount > 0;
}
