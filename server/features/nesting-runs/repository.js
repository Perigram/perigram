import { connectDB } from '~/server/db/mongo';

const COLLECTION = 'nesting_runs';

export async function create(data) {
  const db = await connectDB();
  const doc = {
    ...data,
    _id: data.identity.uid
  };
  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

export async function findById(uid) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: uid });
}

export async function find(filter = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).find(filter).toArray();
}

export async function count(filter = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).countDocuments(filter);
}

export async function updateById(uid, updates) {
  const db = await connectDB();
  const { _id, identity, ...clean } = updates;
  await db.collection(COLLECTION).updateOne(
    { _id: uid }, 
    { $set: clean }
  );
  return await findById(uid);
}

export async function deleteById(uid) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ _id: uid });
}
