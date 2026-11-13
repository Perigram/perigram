import { connectDB } from '~/server/db/mongo';
import { toFlexibleId } from '../../utils/objectid.js';
import { collection } from '../../utils/repository.js';

const organizations = collection('organizations');

export const create = organizations.create;
export const findById = organizations.findById;
export const find = organizations.find;
export const findByIds = organizations.findByIds;
export const updateById = organizations.updateById;
export const deleteById = organizations.deleteById;
export const searchByName = (query, limit = 10) =>
  organizations.searchByName(query, 'identity.name', limit);

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

export async function setRoleAssignment(organizationId, userId, assignment) {
  const db = await connectDB();
  const orgCollection = db.collection('organizations');
  const filter = { _id: toFlexibleId(organizationId) };
  const targetUserId = String(userId);
  const roleIds = [...new Set(Array.isArray(assignment?.roleIds) ? assignment.roleIds.map(String) : [])];
  // Single-seat roles (organizations README): assigning one moves the seat —
  // every other holder loses it in the same write. This is the one
  // assignment write seam (register, bots, invitations, the org API all
  // pass through), so exclusivity has exactly one home.
  const organization = roleIds.length
    ? await orgCollection.findOne(filter, { projection: { 'data.roles': 1, 'data.roleAssignments': 1 } })
    : null;
  const roles = organization?.data?.roles || {};
  const exclusiveRoles = roleIds.filter(roleId => roles[roleId]?.exclusive);
  const displaced = exclusiveRoles.length
    ? Object.entries(organization?.data?.roleAssignments || {})
        .filter(([holderId, row]) => holderId !== targetUserId && (row?.roleIds || []).some(id => exclusiveRoles.includes(String(id))))
    : [];
  for (const [holderId, row] of displaced) {
    const remaining = (row?.roleIds || []).filter(id => !exclusiveRoles.includes(String(id)));
    await orgCollection.updateOne(
      filter,
      remaining.length
        ? { $set: { [`data.roleAssignments.${holderId}.roleIds`]: remaining } }
        : { $unset: { [`data.roleAssignments.${holderId}`]: '' } }
    );
  }
  return await orgCollection.updateOne(
    filter,
    { $set: { [`data.roleAssignments.${targetUserId}`]: assignment } }
  );
}

export async function removeRoleAssignment(organizationId, userId) {
  const db = await connectDB();
  return await db.collection('organizations').updateOne(
    { _id: toFlexibleId(organizationId) },
    { $unset: { [`data.roleAssignments.${String(userId)}`]: '' } }
  );
}
