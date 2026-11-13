import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { toFlexibleId } from '../../utils/objectid.js';

const COLLECTION = 'collection_name';

export async function create(data) {
  const db = await connectDB();
  const doc = {
    ...data,
    _id: data._id || new ObjectId()
  };
  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

export async function findById(uid) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toFlexibleId(uid) });
}

export async function find(filter = {}, options = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find(filter)
    .limit(options.limit || 100)
    .skip(options.skip || 0)
    .toArray();
}

export async function updateById(uid, updates) {
  const db = await connectDB();
  const { _id, identity, ...clean } = updates;

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

