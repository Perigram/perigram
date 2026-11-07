import { connectDB } from '~/server/db/mongo';
import { toFlexibleId } from '~/server/utils/objectid.js';

const COLLECTION = 'pages';

export function serialize(row) {
  return {
    _id: row._id.toString(),
    kind: row.kind,
    name: row.name,
    parentId: row.parentId ? String(row.parentId) : null
  };
}

export function serializeFull(row) {
  return {
    ...serialize(row),
    organizationId: String(row.organizationId),
    content: row.content || '',
    createdBy: row.createdBy ? String(row.createdBy) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export async function findByOrganization(organizationId) {
  const db = await connectDB();
  return db.collection(COLLECTION)
    .find({ organizationId: toFlexibleId(organizationId) })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
}

export async function findById(id) {
  const db = await connectDB();
  if (!id) return null;
  return db.collection(COLLECTION).findOne({ _id: toFlexibleId(id) });
}

export async function create(data) {
  const db = await connectDB();
  const now = new Date();
  const result = await db.collection(COLLECTION).insertOne({
    kind: 'page',
    name: '',
    parentId: null,
    content: '',
    ...data,
    createdAt: now,
    updatedAt: now
  });
  return result.insertedId;
}

export async function update(id, changes) {
  const db = await connectDB();
  return db.collection(COLLECTION).findOneAndUpdate(
    { _id: toFlexibleId(id) },
    { $set: { ...changes, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
}

export async function detachChildren(organizationId, parentId) {
  const db = await connectDB();
  await db.collection(COLLECTION).updateMany(
    { organizationId: toFlexibleId(organizationId), parentId: toFlexibleId(parentId) },
    { $set: { parentId: null, updatedAt: new Date() } }
  );
}

export async function remove(id) {
  const db = await connectDB();
  await db.collection(COLLECTION).deleteOne({ _id: toFlexibleId(id) });
}
