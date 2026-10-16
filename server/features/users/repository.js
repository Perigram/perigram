import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { toFlexibleId } from '../../utils/objectid.js';

const COLLECTION = 'users';

export async function create(data) {
  const db = await connectDB();
  const cleanData = data.toJSON ? data.toJSON() : data;
  const passwordHash = data.data?.passwordHash || cleanData.data?.passwordHash;
  const bot = data.data?.bot || cleanData.data?.bot;
  const doc = {
    ...cleanData,
    data: {
      ...(cleanData.data || {}),
      ...(passwordHash ? { passwordHash } : {}),
      ...(bot ? { bot } : {})
    },
    _id: cleanData._id || data._id || new ObjectId()
  };
  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toFlexibleId(id) });
}

export async function findByIds(ids = []) {
  const flexibleIds = ids.map(toFlexibleId).filter(Boolean);
  if (!flexibleIds.length) return [];
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find({ _id: { $in: flexibleIds } })
    .toArray();
}

export async function findByEmail(email) {
  const db = await connectDB();
  const emailLower = email.toLowerCase();
  return await db.collection(COLLECTION).findOne({
    $or: [
      { 'data.email': emailLower },
      { 'email': emailLower }
    ]
  });
}

export async function find(filter = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).find(filter).toArray();
}

export async function searchByName(query, limit = 10) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find({
      'identity.name': { $regex: escapeRegex(String(query || '')), $options: 'i' },
      'data.isActive': { $ne: false }
    })
    .sort({ 'identity.name': 1 })
    .limit(limit)
    .toArray();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function findActiveMembersByOrganization(organizationId) {
  const db = await connectDB();
  return await db.collection(COLLECTION).find({
    'data.memberships': {
      $elemMatch: {
        organizationId: { $in: organizationIdValues(organizationId) },
        $or: [{ status: 'active' }, { status: { $exists: false } }]
      }
    }
  }).toArray();
}

export async function findActiveOwnersByOrganization(organizationId) {
  const db = await connectDB();
  return await db.collection(COLLECTION).find({
    'data.memberships': {
      $elemMatch: {
        organizationId: { $in: organizationIdValues(organizationId) },
        $or: [{ status: 'active' }, { status: { $exists: false } }],
        owner: true
      }
    }
  }).toArray();
}

export async function updateById(id, updates) {
  const db = await connectDB();
  const { _id, ...clean } = updates;
  await db.collection(COLLECTION).updateOne(
    { _id: toFlexibleId(id) }, 
    { $set: clean }
  );
  return await findById(id);
}

export async function updateLastLogin(id) {
    const db = await connectDB();
    await db.collection(COLLECTION).updateOne(
        { _id: toFlexibleId(id) },
        { $set: { 'data.lastLoginAt': new Date() } }
    );
}

export async function setMembershipStatus(userId, organizationId, status) {
  const db = await connectDB();
  return await db.collection(COLLECTION).updateOne(
    { _id: toFlexibleId(userId), 'data.memberships.organizationId': toFlexibleId(organizationId) },
    { $set: { 'data.memberships.$.status': status } }
  );
}

export async function removeMembership(userId, organizationId) {
  const db = await connectDB();
  return await db.collection(COLLECTION).updateOne(
    { _id: toFlexibleId(userId) },
    { $pull: { 'data.memberships': { organizationId: toFlexibleId(organizationId) } } }
  );
}

export async function addMembership(userId, membership) {
  const db = await connectDB();
  return await db.collection(COLLECTION).updateOne(
    { _id: toFlexibleId(userId) },
    { $push: { 'data.memberships': membership } }
  );
}

export async function updateMembershipPermissions(userId, organizationId, permissions) {
  const db = await connectDB();
  return await db.collection(COLLECTION).updateOne(
    { _id: toFlexibleId(userId), 'data.memberships.organizationId': toFlexibleId(organizationId) },
    { $set: { 'data.memberships.$.permissions': permissions, 'data.permissions': permissions } }
  );
}

export async function updateGlobalPermissions(userId, permissions) {
  const db = await connectDB();
  return await db.collection(COLLECTION).updateOne(
    { _id: toFlexibleId(userId) },
    { $set: { 'data.permissions': permissions } }
  );
}

export async function updateAvatar(userId, avatar) {
  const db = await connectDB();
  const update = avatar
    ? { $set: { 'data.avatar': avatar } }
    : { $unset: { 'data.avatar': '' } };
  await db.collection(COLLECTION).updateOne({ _id: toFlexibleId(userId) }, update);
  return await findById(userId);
}

export async function deleteById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ _id: toFlexibleId(id) });
}

function organizationIdValues(organizationId) {
  return [toFlexibleId(organizationId), organizationId?.toString?.() || organizationId].filter(Boolean);
}
