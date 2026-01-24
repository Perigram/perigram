/**
 * Artifacts Repository
 */

import { connectDB, getArtifactsBucket } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';

import { toObjectId } from '../../utils/objectid.js';
const COLLECTION = 'artifacts';

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toObjectId(id) });
}

export async function findByQueue(queueId, options = {}) {
  const db = await connectDB();
  const { type, status, limit = 100, skip = 0 } = options;
  
  const query = { queueId: toObjectId(queueId) };
  if (type) query.type = type;
  if (status) query.status = status;
  
  return await db.collection(COLLECTION)
    .find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();
}

export async function create(data) {
  const db = await connectDB();
  const doc = {
    type: data.type,
    name: data.name,
    queueId: data.queueId,
    projectId: data.projectId,
    runId: data.runId,
    fileId: data.fileId, // Link to geometry/binary data in GridFS
    mimeType: data.mimeType,
    fileSize: data.fileSize,
    metadata: data.metadata || {},
    generatedBy: data.generatedBy,
    status: 'GENERATING',
    createdAt: new Date()
  };
  
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

export async function deleteFile(fileId) {
  if (!fileId) return;
  try {
    const bucket = await getArtifactsBucket();
    await bucket.delete(toObjectId(fileId));
  } catch (error) {
    // If the file doesn't exist, GridFS throws an error. We can ignore it.
    if (error.code !== 'ENOENT') {
      // Log other errors
      console.error(`Error deleting file from GridFS: ${fileId}`, error);
      throw error; // Re-throw if it's not a "file not found" error
    }
  }
}
