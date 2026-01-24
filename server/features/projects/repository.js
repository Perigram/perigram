import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'projects';

export async function create(data) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).insertOne(data);
  return { ...data, _id: result.insertedId };
}

export async function findBySlug(slug) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ 'identity.slug': slug });
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

export async function find(filter = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).find(filter).toArray();
}

export async function updateById(id, updates) {
  const db = await connectDB();
  const { _id, identity, origin, ...clean } = updates;
  // Use dot notation if we want to update specific identity fields or just $set whole blocks
  return await db.collection(COLLECTION).updateOne({ _id: new ObjectId(id) }, { $set: clean });
}

export async function updateBySlug(slug, updates) {
  const db = await connectDB();
  const { _id, identity, origin, ...clean } = updates;
  return await db.collection(COLLECTION).updateOne({ 'identity.slug': slug }, { $set: clean });
}

export async function deleteBySlug(slug) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ 'identity.slug': slug });
}