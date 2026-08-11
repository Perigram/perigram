import { ObjectId } from 'mongodb';
import { connectDB } from '~/server/db/mongo.js';
import { toFlexibleId } from '~/server/utils/objectid.js';

const COLLECTION = 'facades';

export async function create(data) {
  const db = await connectDB();
  const document = { ...data, _id: data._id || new ObjectId() };
  await db.collection(COLLECTION).insertOne(document);
  return document;
}
export async function findById(id) { return (await connectDB()).collection(COLLECTION).findOne({ _id: toFlexibleId(id) }); }
export async function find(filter = {}, options = {}) { return (await connectDB()).collection(COLLECTION).find(filter).limit(options.limit || 100).skip(options.skip || 0).toArray(); }
export async function updateById(id, updates) {
  const { _id, ...patch } = updates;
  await (await connectDB()).collection(COLLECTION).updateOne({ _id: toFlexibleId(id) }, { $set: patch });
  return await findById(id);
}
export async function deleteById(id) { return (await connectDB()).collection(COLLECTION).deleteOne({ _id: toFlexibleId(id) }); }
