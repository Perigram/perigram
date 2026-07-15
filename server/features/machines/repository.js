import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';

const COLLECTION = 'machines';

export async function create(doc) {
  const db = await connectDB();
  const stored = { ...doc, _id: doc.identity?.uid || doc._id };
  await db.collection(COLLECTION).insertOne(stored);
  return stored;
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toFlexibleId(id) });
}

export async function find(filter = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).find(filter).sort({ 'lineage.scope': -1, 'identity.name': 1 }).toArray();
}

export async function updateById(id, patch) {
  const db = await connectDB();
  await db.collection(COLLECTION).updateOne({ _id: toFlexibleId(id) }, { $set: patch });
  return await findById(id);
}

export async function deleteById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ _id: toFlexibleId(id) });
}

export async function upsertSystemDefault(doc) {
  const db = await connectDB();
  const { _id, ...mutable } = doc;
  await db.collection(COLLECTION).updateOne(
    { 'data.systemKey': doc.data.systemKey },
    {
      $set: mutable,
      $setOnInsert: { _id }
    },
    { upsert: true }
  );
  return await db.collection(COLLECTION).findOne({ 'data.systemKey': doc.data.systemKey });
}
