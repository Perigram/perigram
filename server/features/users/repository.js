import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';
import { collection } from '../../utils/repository.js';

const users = collection('users');

export const findById = users.findById;
export const findByIds = users.findByIds;
export const find = users.find;
export const updateById = users.updateById;
export const deleteById = users.deleteById;
export const searchByName = (query, limit = 10) =>
  users.searchByName(query, 'identity.name', limit);

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
    _id: cleanData._id || data._id || undefined
  };
  return users.create(doc);
}

export async function findByEmail(email) {
  const db = await connectDB();
  const emailLower = email.toLowerCase();
  return await db.collection('users').findOne({
    $or: [
      { 'data.email': emailLower },
      { 'email': emailLower }
    ]
  });
}

export async function findActiveMembersByOrganization(organizationId) {
  const db = await connectDB();
  return await db.collection('users').find({
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
  return await db.collection('users').find({
    'data.memberships': {
      $elemMatch: {
        organizationId: { $in: organizationIdValues(organizationId) },
        $or: [{ status: 'active' }, { status: { $exists: false } }],
        owner: true
      }
    }
  }).toArray();
}

export async function updateLastLogin(id) {
    const db = await connectDB();
    await db.collection('users').updateOne(
        { _id: toFlexibleId(id) },
        { $set: { 'data.lastLoginAt': new Date() } }
    );
}

export async function setMembershipStatus(userId, organizationId, status) {
  const db = await connectDB();
  return await db.collection('users').updateOne(
    { _id: toFlexibleId(userId), 'data.memberships.organizationId': toFlexibleId(organizationId) },
    { $set: { 'data.memberships.$.status': status } }
  );
}

export async function removeMembership(userId, organizationId) {
  const db = await connectDB();
  return await db.collection('users').updateOne(
    { _id: toFlexibleId(userId) },
    { $pull: { 'data.memberships': { organizationId: toFlexibleId(organizationId) } } }
  );
}

export async function setActiveOrganization(userId, organizationId, permissions = {}) {
  const db = await connectDB();
  return db.collection('users').updateOne(
    { _id: toFlexibleId(userId) },
    {
      $set: {
        'lineage.organizationId': organizationId ? toFlexibleId(organizationId) : null,
        'data.permissions': permissions || {}
      }
    }
  );
}

export async function addMembership(userId, membership, { activeOrganizationId = null } = {}) {
  const db = await connectDB();
  const update = { $push: { 'data.memberships': membership } };
  if (activeOrganizationId != null) {
    update.$set = { 'lineage.organizationId': toFlexibleId(activeOrganizationId) };
  }
  return await db.collection('users').updateOne(
    { _id: toFlexibleId(userId) },
    update
  );
}

export async function updateMembershipPermissions(userId, organizationId, permissions) {
  const db = await connectDB();
  return await db.collection('users').updateOne(
    { _id: toFlexibleId(userId), 'data.memberships.organizationId': toFlexibleId(organizationId) },
    { $set: { 'data.memberships.$.permissions': permissions, 'data.permissions': permissions } }
  );
}

export async function updateGlobalPermissions(userId, permissions) {
  const db = await connectDB();
  return await db.collection('users').updateOne(
    { _id: toFlexibleId(userId) },
    { $set: { 'data.permissions': permissions } }
  );
}

export async function updateAvatar(userId, avatar) {
  const db = await connectDB();
  const update = avatar
    ? { $set: { 'data.avatar': avatar } }
    : { $unset: { 'data.avatar': '' } };
  await db.collection('users').updateOne({ _id: toFlexibleId(userId) }, update);
  return await findById(userId);
}

function organizationIdValues(organizationId) {
  return [toFlexibleId(organizationId), organizationId?.toString?.() || organizationId].filter(Boolean);
}
