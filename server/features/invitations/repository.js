import { connectDB } from '~/server/db/mongo';
import { toFlexibleId } from '~/server/utils/objectid.js';

const COLLECTION = 'invitations';

export function isPendingStatus(status) {
  return status === 'pending';
}

export async function create(data) {
  const db = await connectDB();
  const now = new Date();
  const result = await db.collection(COLLECTION).insertOne({
    ...data,
    status: data.status || 'pending',
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  });
  return result.insertedId;
}

export async function findByCode(code) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ code: code.toUpperCase() });
}

export async function accept(id, userId) {
  return setStatus(id, 'accepted', userId);
}

export async function findByToken(token) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ token });
}

export async function revoke(id, userId) {
  return setStatus(id, 'revoked', userId, { revokedAt: new Date() });
}

export async function findByOrg(organizationId) {
  const db = await connectDB();
  return db.collection(COLLECTION)
    .find({
      organizationId: toFlexibleId(organizationId),
      status: 'pending',
      expiresAt: { $gt: new Date() }
    })
    .toArray();
}

export async function findById(id) {
  const db = await connectDB();
  if (!id) return null;
  return await db.collection(COLLECTION).findOne({ _id: toFlexibleId(id) });
}

export async function findActiveByInvitee(userId) {
  const db = await connectDB();
  return db.collection(COLLECTION)
    .find({
      inviteeUserId: String(userId),
      status: 'pending',
      expiresAt: { $gt: new Date() }
    })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function findActiveByInviteeAndOrganization(userId, organizationId) {
  const db = await connectDB();
  return db.collection(COLLECTION).findOne({
    inviteeUserId: String(userId),
    organizationId: toFlexibleId(organizationId),
    status: 'pending',
    expiresAt: { $gt: new Date() }
  });
}

export async function setStatus(id, status, userId, extra = {}) {
  const db = await connectDB();
  return db.collection(COLLECTION).findOneAndUpdate(
    { _id: toFlexibleId(id), status: 'pending' },
    {
      $set: {
        status,
        updatedAt: new Date(),
        usedAt: new Date(),
        usedBy: userId,
        ...extra
      }
    },
    { returnDocument: 'after' }
  );
}
