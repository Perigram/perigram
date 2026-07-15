import { ObjectId } from 'mongodb';
import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';

const COLLECTION = 'profile_templates';

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toFlexibleId(id) });
}

export async function findSystem() {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find({ 'lineage.userId': null, 'lineage.organizationId': null })
    .sort({ 'identity.name': 1 })
    .toArray();
}

export async function findByScope({ userId = null, organizationId = null } = {}) {
  const db = await connectDB();
  const scope = [];
  if (userId) scope.push({ 'lineage.userId': userId });
  if (organizationId) scope.push({ 'lineage.organizationId': organizationId });
  if (!scope.length) return [];
  return await db.collection(COLLECTION)
    .find({ $or: scope })
    .sort({ 'identity.name': 1 })
    .toArray();
}

export async function create(data) {
  const db = await connectDB();
  const doc = {
    ...data,
    _id: data._id || new ObjectId()
  };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function updateById(id, updates) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).updateOne(
    { _id: toFlexibleId(id) },
    { $set: updates }
  );
  return result.modifiedCount > 0;
}

export async function deleteById(id) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).deleteOne({ _id: toFlexibleId(id) });
  return result.deletedCount > 0;
}

