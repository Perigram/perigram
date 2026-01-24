import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { toObjectId } from '../../utils/objectid.js';

const COLLECTION = 'artifacts';

export async function create(data) {
  const db = await connectDB();
  const doc = {
    type: data.type,
    name: data.name,
    queueId: data.queueId ? new ObjectId(data.queueId) : null,
    projectId: data.projectId ? new ObjectId(data.projectId) : null,
    runId: data.runId ? new ObjectId(data.runId) : null,
    fileId: data.fileId ? new ObjectId(data.fileId) : null,
    mimeType: data.mimeType,
    fileSize: data.fileSize,
    metadata: data.metadata || {},
    generatedBy: data.generatedBy
  };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toObjectId(id) });
}

export async function findByQueue(queueId) {
  const db = await connectDB();
  return await db.collection(COLLECTION).find({ queueId: toObjectId(queueId) }).toArray();
}

export async function updateById(id, updates) {
  const db = await connectDB();
  const { _id, createdAt, updatedAt, status, success, ...clean } = updates;
  return await db.collection(COLLECTION).updateOne({ _id: toObjectId(id) }, { $set: clean });
}

export async function deleteById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ _id: toObjectId(id) });
}