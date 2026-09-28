import { connectDB } from '~/server/db/mongo';
import { toFlexibleId } from '~/server/utils/objectid.js';

const COLLECTION = 'partnerships';

export async function create(data) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).insertOne({
    ...data,
    status: 'pending',
    createdAt: new Date()
  });
  return result.insertedId;
}

export async function findById(id) {
  const db = await connectDB();
  if (!id) return null;
  return await db.collection(COLLECTION).findOne({ _id: toFlexibleId(id) });
}

export async function findByOrganization(organizationId) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find({ organizationIds: String(organizationId) })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function findBetween(organizationA, organizationB) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({
    organizationIds: { $all: [String(organizationA), String(organizationB)] },
    status: { $in: ['pending', 'active'] }
  });
}

export async function setStatus(id, status, extra = {}) {
  const db = await connectDB();
  if (!id) return;
  await db.collection(COLLECTION).updateOne(
    { _id: toFlexibleId(id) },
    { $set: { status, ...extra } }
  );
}
