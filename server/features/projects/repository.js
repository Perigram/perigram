import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'projects';

export async function create(data) {
  const db = await connectDB();
  const doc = {
    ...data,
    _id: data._id || new ObjectId(),
    createdAt: new Date(),
    updatedAt: new Date()
  };
  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

export async function findBySlug(slug) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ 'identity.slug': slug });
}

export async function find(filter = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).find(filter).toArray();
}

export async function updateBySlug(slug, updates) {
  const db = await connectDB();
  const { _id, ...clean } = updates;
  await db.collection(COLLECTION).updateOne(
    { 'identity.slug': slug }, 
    { $set: { ...clean, updatedAt: new Date() } }
  );
  return await findBySlug(slug);
}

export async function deleteBySlug(slug) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ 'identity.slug': slug });
}
