import { connectDB } from '~/server/db/mongo';
import { toFlexibleId } from '~/server/utils/objectid.js';

const COLLECTION = 'views';

export function serialize(row) {
  return {
    _id: row._id.toString(),
    name: row.name,
    typeId: row.typeId
  };
}

export function serializeFull(row) {
  return {
    ...serialize(row),
    organizationId: String(row.organizationId),
    viewState: row.viewState || {},
    createdBy: row.createdBy ? String(row.createdBy) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export async function findByOrganization(organizationId, typeId = null) {
  const db = await connectDB();
  const query = { organizationId: toFlexibleId(organizationId) };
  if (typeId) query.typeId = String(typeId);
  return db.collection(COLLECTION)
    .find(query)
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
    name: '',
    typeId: '',
    viewState: {},
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

export async function remove(id) {
  const db = await connectDB();
  await db.collection(COLLECTION).deleteOne({ _id: toFlexibleId(id) });
}
