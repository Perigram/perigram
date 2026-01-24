import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'projects';

export async function create(data) {
  const db = await connectDB();
  const doc = {
    slug: data.slug,
    name: data.name,
    contractorId: data.contractorId ? new ObjectId(data.contractorId) : null,
    batchIds: data.batchIds || [],
    queueIds: data.queueIds || [],
    metadata: data.metadata || {},
    tep: data.tep || {},
    statistics: data.statistics || {}
  };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function findBySlug(slug) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ slug });
}

export async function find(filter = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).find(filter).toArray();
}

export async function updateBySlug(slug, updates) {
  const db = await connectDB();
  // Filter out any non-functional fields
  const { _id, createdAt, updatedAt, status, ownerId, ...clean } = updates;
  return await db.collection(COLLECTION).updateOne({ slug }, { $set: clean });
}

export async function deleteBySlug(slug) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ slug });
}