import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'invitations';

export async function create(data) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).insertOne({
    ...data,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  });
  return result.insertedId;
}

export async function findByCode(code) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ code, isActive: true });
}

export async function markAsUsed(id) {
  const db = await connectDB();
  await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { $set: { isActive: false, usedAt: new Date() } }
  );
}

export async function findByOrg(organizationId) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find({ organizationId: new ObjectId(organizationId), isActive: true })
    .toArray();
}
