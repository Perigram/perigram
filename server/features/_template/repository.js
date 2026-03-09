import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';

const COLLECTION = 'collection_name';

/**
 * Standard Create
 */
export async function create(data) {
  const db = await connectDB();
  const doc = {
    ...data,
    _id: data.identity?.uid || data._id // Standard: uid is the _id
  };
  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

/**
 * Standard Find by ID (supports string UIDs and ObjectIds)
 */
export async function findById(uid) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toFlexibleId(uid) });
}

/**
 * Standard Find with Filter
 */
export async function find(filter = {}, options = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find(filter)
    .limit(options.limit || 100)
    .skip(options.skip || 0)
    .toArray();
}

/**
 * Standard Update
 */
export async function updateById(uid, updates) {
  const db = await connectDB();
  const { _id, identity, ...clean } = updates;
  
  await db.collection(COLLECTION).updateOne(
    { _id: toFlexibleId(uid) }, 
    { $set: clean }
  );
  return await findById(uid);
}

/**
 * Standard Delete
 */
export async function deleteById(uid) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ _id: toFlexibleId(uid) });
}
