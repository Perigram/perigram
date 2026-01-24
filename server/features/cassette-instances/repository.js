import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { toObjectId } from '../../utils/objectid.js';

const COLLECTION = 'cassette_instances';

export async function create(data) {
  const db = await connectDB();
  const doc = {
    cassetteTemplateId: data.cassetteTemplateId ? new ObjectId(data.cassetteTemplateId) : null,
    cassetteDesignId: data.cassetteDesignId ? new ObjectId(data.cassetteDesignId) : null,
    instanceNumber: data.instanceNumber,
    queueId: data.queueId ? new ObjectId(data.queueId) : null,
    projectSlug: data.projectSlug,
    note: data.note || ''
  };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function insertMany(instances) {
  const db = await connectDB();
  const docs = instances.map(i => ({
    cassetteTemplateId: i.cassetteTemplateId ? new ObjectId(i.cassetteTemplateId) : null,
    cassetteDesignId: i.cassetteDesignId ? new ObjectId(i.cassetteDesignId) : null,
    instanceNumber: i.instanceNumber,
    queueId: i.queueId ? new ObjectId(i.queueId) : null,
    projectSlug: i.projectSlug,
    note: i.note || ''
  }));
  return await db.collection(COLLECTION).insertMany(docs);
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
  const { _id, createdAt, updatedAt, status, statusHistory, userId, timestamp, success, dimensions, count, ...clean } = updates;
  return await db.collection(COLLECTION).updateOne({ _id: toObjectId(id) }, { $set: clean });
}