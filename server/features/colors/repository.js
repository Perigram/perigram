import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'colors';

export async function create(data) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).insertOne({
    ...data,
    catalogId: new ObjectId(data.catalogId),
    createdAt: new Date(),
    updatedAt: new Date()
  });
  return await findById(result.insertedId);
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

export async function find(filter = {}, options = {}) {
  const db = await connectDB();
  if (filter.catalogId) filter.catalogId = new ObjectId(filter.catalogId);
  
  return await db.collection(COLLECTION)
    .find(filter)
    .sort(options.sort || { name: 1 })
    .toArray();
}

export async function updateById(id, updates) {
  const db = await connectDB();
  if (updates.catalogId) updates.catalogId = new ObjectId(updates.catalogId);
  
  const result = await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...updates, updatedAt: new Date() } }
  );
  return result.modifiedCount > 0;
}

export async function deleteById(id) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

export async function deleteByCatalogId(catalogId) {
    const db = await connectDB();
    await db.collection(COLLECTION).deleteMany({ catalogId: new ObjectId(catalogId) });
}
