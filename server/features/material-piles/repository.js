import { connectDB } from '~/server/db/mongo';
import { toFlexibleId } from '../../utils/objectid.js';

const COLLECTION = 'material_piles';

export async function create(data) {
  const db = await connectDB();
  const doc = {
    ...data,
    _id: data.identity.uid // Standard: uid is the _id
  };
  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

export async function findById(uid) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toFlexibleId(uid) });
}

export async function find(filter = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).find(filter).toArray();
}

export async function updateById(uid, updates) {
  const db = await connectDB();
  const { _id, ...clean } = updates;
  await db.collection(COLLECTION).updateOne(
    { _id: toFlexibleId(uid) }, 
    { $set: clean }
  );
  return await findById(uid);
}

export async function deleteById(uid) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ _id: toFlexibleId(uid) });
}
