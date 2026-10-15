import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';
import { toFlexibleId } from '../../utils/objectid.js';

const COLLECTION = 'organizations';

export async function create(data) {
  const db = await connectDB();
  const doc = {
    ...data,
    _id: data._id || new ObjectId()
  };
  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toFlexibleId(id) });
}

export async function find(filter = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).find(filter).toArray();
}

export async function searchByName(query, limit = 10) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find({ 'identity.name': { $regex: escapeRegex(String(query || '')), $options: 'i' } })
    .sort({ 'identity.name': 1 })
    .limit(limit)
    .toArray();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

export async function deleteById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ _id: toFlexibleId(id) });
}

export async function addUserMembership(userId, membership, { organizationId }) {
  const db = await connectDB();
  return await db.collection('users').updateOne(
    { _id: toFlexibleId(userId) },
    {
      $push: { 'data.memberships': membership },
      $set: {
        'lineage.organizationId': organizationId
      }
    }
  );
}

export async function findByIds(ids) {
  const db = await connectDB();
  const flexibleIds = ids.map(id => toFlexibleId(id));
  return await db.collection(COLLECTION).find({ _id: { $in: flexibleIds } }).toArray();
}

export async function setRoleAssignment(organizationId, userId, assignment) {
  const db = await connectDB();
  const collection = db.collection(COLLECTION);
  const filter = { _id: toFlexibleId(organizationId) };
  const targetUserId = String(userId);
  const roleIds = [...new Set(Array.isArray(assignment?.roleIds) ? assignment.roleIds.map(String) : [])];
  // Single-seat roles (organizations README): assigning one moves the seat —
  // every other holder loses it in the same write. This is the one
  // assignment write seam (register, bots, invitations, the org API all
  // pass through), so exclusivity has exactly one home.
  const organization = roleIds.length
    ? await collection.findOne(filter, { projection: { 'data.roles': 1, 'data.roleAssignments': 1 } })
    : null;
  const roles = organization?.data?.roles || {};
  const exclusiveRoles = roleIds.filter(roleId => roles[roleId]?.exclusive);
  const displaced = exclusiveRoles.length
    ? Object.entries(organization?.data?.roleAssignments || {})
        .filter(([holderId, row]) => holderId !== targetUserId && (row?.roleIds || []).some(id => exclusiveRoles.includes(String(id))))
    : [];
  for (const [holderId, row] of displaced) {
    const remaining = (row?.roleIds || []).filter(id => !exclusiveRoles.includes(String(id)));
    await collection.updateOne(
      filter,
      remaining.length
        ? { $set: { [`data.roleAssignments.${holderId}.roleIds`]: remaining } }
        : { $unset: { [`data.roleAssignments.${holderId}`]: '' } }
    );
  }
  return await collection.updateOne(
    filter,
    { $set: { [`data.roleAssignments.${targetUserId}`]: assignment } }
  );
}

export async function removeRoleAssignment(organizationId, userId) {
  const db = await connectDB();
  return await db.collection(COLLECTION).updateOne(
    { _id: toFlexibleId(organizationId) },
    { $unset: { [`data.roleAssignments.${String(userId)}`]: '' } }
  );
}
