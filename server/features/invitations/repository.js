import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';
import { toFlexibleId } from '~/server/utils/objectid.js';

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
  return await db.collection(COLLECTION).findOne({ code: code.toUpperCase(), isActive: true });
}

export async function markAsUsed(id) {
  const db = await connectDB();
  await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { $set: { isActive: false, usedAt: new Date() } }
  );
}

export async function accept(id, userId) {
  const db = await connectDB();
  await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { $set: { isActive: false, usedAt: new Date(), usedBy: userId, status: 'accepted' } }
  );
}

export async function findByToken(token) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ token, isActive: true });
}

export async function revoke(id) {
  const db = await connectDB();
  await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { $set: { isActive: false, revokedAt: new Date() } }
  );
}

export async function findByOrg(organizationId) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find({ organizationId: toFlexibleId(organizationId), isActive: true })
    .toArray();
}

export async function findById(id) {
  const db = await connectDB();
  if (!id) return null;
  return await db.collection(COLLECTION).findOne({ _id: toFlexibleId(id) });
}

export async function findActiveByInvitee(userId) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find({ inviteeUserId: String(userId), isActive: true })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function findActiveByInviteeAndOrganization(userId, organizationId) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({
    inviteeUserId: String(userId),
    organizationId: toFlexibleId(organizationId),
    isActive: true
  });
}

export async function setStatus(id, status, userId) {
  const db = await connectDB();
  await db.collection(COLLECTION).updateOne(
    { _id: toFlexibleId(id) },
    { $set: { isActive: false, status, usedAt: new Date(), usedBy: userId } }
  );
}
