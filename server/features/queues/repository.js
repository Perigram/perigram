/**
 * Queues Repository - Functional Data Only
 */

import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { toObjectId } from '../../utils/objectid.js';

const COLLECTION = 'queues';

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
    .sort({ queueNumber: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();
}

/**
 * Note: Querying by owner now requires looking up the initial 'created' status 
 * in the statuses collection if ownerId is removed from here.
 * For now, I'm keeping organizationId for partitioning.
 */
export async function findByOrg(organizationId, options = {}) {
  const db = await connectDB();
  const { limit = 100, skip = 0 } = options;
  return await db.collection(COLLECTION)
    .find({ organizationId: toObjectId(organizationId) })
    .skip(skip)
    .limit(limit)
    .toArray();
}

export async function getNextQueueNumber(projectSlug) {
  const db = await connectDB();
  const lastQueue = await db.collection(COLLECTION)
    .findOne({ projectSlug }, { sort: { queueNumber: -1 } });
  return lastQueue ? lastQueue.queueNumber + 1 : 1;
}

export async function create(data) {
  const db = await connectDB();
  const doc = {
    projectSlug: data.projectSlug,
    queueNumber: data.queueNumber,
    name: data.name,
    organizationId: toObjectId(data.organizationId),
    entries: data.entries || [],
    additionalFiles: data.additionalFiles || [],
    previousRemainder: data.previousRemainder || null,
    status: 'DRAFT',
    artifacts: [],
    runs: [],
    chosenRunId: null
  };
  
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function updateById(id, updates) {
  const db = await connectDB();
  
  // Functional updates only
  const allowed = ['name', 'entries', 'additionalFiles', 'previousRemainder', 'nestingParams', 'chosenRunId', 'status'];
  const filtered = {};
  allowed.forEach(key => {
    if (updates[key] !== undefined) filtered[key] = updates[key];
  });

  const result = await db.collection(COLLECTION).updateOne(
    { _id: toObjectId(id) },
    { $set: filtered }
  );
  return result.modifiedCount > 0;
}

export async function deleteById(id) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).deleteOne({ _id: toObjectId(id) });
  return result.deletedCount > 0;
}

export async function addRun(id, run) {
  const db = await connectDB();
  const batch = await db.collection(COLLECTION).findOne({ _id: toObjectId(id) });
  run.runNumber = (batch.runs || []).length + 1;
  
  return await db.collection(COLLECTION).updateOne(
    { _id: toObjectId(id) },
    { $push: { runs: run } }
  );
}

export async function setRunStatus(id, runId, status) {
  const db = await connectDB();
  return await db.collection(COLLECTION).updateOne(
    { _id: toObjectId(id), 'runs._id': toObjectId(runId) },
    { $set: { 'runs.$.status': status } }
  );
}