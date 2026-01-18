/**
 * Batches Repository
 */

import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';

import { toObjectId } from '../../utils/objectid.js';
const COLLECTION = 'batches';

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toObjectId(id) });
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
  
  // Handle OAuth userId strings (e.g., "google:12345") - use as-is, not as ObjectId
  return await db.collection(COLLECTION)
    .find({ ownerId: ownerId })
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
    runs: [],
    chosenRunId: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function updateById(id, updates) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).updateOne(
    { _id: toObjectId(id) },
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
  const result = await db.collection(COLLECTION).deleteOne({ _id: toObjectId(id) });
  return result.deletedCount > 0;
}

export async function addArtifact(id, artifactId) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).updateOne(
    { _id: toObjectId(id) },
    { 
      $push: { artifacts: toObjectId(artifactId) },
      $set: { updatedAt: new Date() }
    }
  );
  return result.modifiedCount > 0;
}

export async function addRun(id, run) {
  const db = await connectDB();
  
  // Get current runs to calculate run number
  const batch = await db.collection(COLLECTION).findOne({ _id: toObjectId(id) });
  const runNumber = (batch.runs || []).length + 1;
  
  run.runNumber = runNumber;
  
  const result = await db.collection(COLLECTION).updateOne(
    { _id: toObjectId(id) },
    {
      $push: { runs: run },
      $set: { updatedAt: new Date() }
    }
  );
  return result.modifiedCount > 0;
}

export async function setRunStatus(id, runId, status) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).updateOne(
    { _id: toObjectId(id), 'runs._id': toObjectId(runId) },
    {
      $set: {
        'runs.$.status': status,
        'runs.$.updatedAt': new Date(),
        updatedAt: new Date()
      }
    }
  );
  return result.modifiedCount > 0;
}

export async function setRunsStatusByStatus(id, fromStatus, toStatus) {
  const db = await connectDB();
  const now = new Date();
  const result = await db.collection(COLLECTION).updateOne(
    { _id: toObjectId(id) },
    {
      $set: {
        'runs.$[run].status': toStatus,
        'runs.$[run].updatedAt': now,
        updatedAt: now
      }
    },
    { arrayFilters: [{ 'run.status': fromStatus }] }
  );
  return result.modifiedCount > 0;
}

export async function setChosenRun(id, runId) {
  const db = await connectDB();
  const now = new Date();
  const chosenObjectId = toObjectId(runId);
  await db.collection(COLLECTION).updateOne(
    { _id: toObjectId(id), 'runs._id': chosenObjectId },
    {
      $set: {
        chosenRunId: chosenObjectId,
        'runs.$.status': 'CHOSEN',
        'runs.$.updatedAt': now,
        updatedAt: now
      }
    }
  );
  const result = await db.collection(COLLECTION).updateOne(
    { _id: toObjectId(id) },
    {
      $set: {
        'runs.$[run].status': 'COMPLETE',
        'runs.$[run].updatedAt': now,
        updatedAt: now
      }
    },
    { arrayFilters: [{ 'run._id': { $ne: chosenObjectId }, 'run.status': 'CHOSEN' }] }
  );
  return result.modifiedCount > 0;
}
