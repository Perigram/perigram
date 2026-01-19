import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'projects';

export async function create(data) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).insertOne({
    ...data,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  return { ...data, _id: result.insertedId };
}

export async function findBySlug(slug) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ slug });
}

export async function find(filter = {}, options = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find(filter)
    .sort(options.sort || { createdAt: -1 })
    .limit(options.limit || 100)
    .toArray();
}

export async function updateBySlug(slug, updates) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).updateOne(
    { slug },
    { $set: { ...updates, updatedAt: new Date() } }
  );
  return result.modifiedCount > 0;
}

export async function deleteBySlug(slug) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).deleteOne({ slug });
  return result.deletedCount > 0;
}
