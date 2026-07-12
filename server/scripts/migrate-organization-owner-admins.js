import { connectDB } from '../db/mongo.js';
import { toFlexibleId } from '../utils/objectid.js';
import { mergeOwnerPermissions } from '../features/users/organization-owner.js';

function idValues(id) {
  return [toFlexibleId(id), id?.toString?.() || id].filter(Boolean);
}

function isActiveMembership(membership = {}, organizationId) {
  return idValues(organizationId).some(value => membership.organizationId?.toString?.() === value?.toString?.())
    && !['pending', 'rejected'].includes(membership.status);
}

function hasAdminGrant(membership = {}) {
  const organizations = membership.permissions?.organizations;
  const users = membership.permissions?.users;
  return organizations?.level === 'admin' && users?.level === 'admin';
}

function creatorId(organization = {}) {
  return organization.origin?.userId
    || organization.origin?.createdBy
    || organization.status?.userId
    || organization.data?.createdBy
    || null;
}

async function selectOwnerUser(db, organization) {
  const organizationId = organization._id;
  const activeMembers = await db.collection('users').find({
    'data.memberships': {
      $elemMatch: {
        organizationId: { $in: idValues(organizationId) },
        $or: [{ status: 'active' }, { status: { $exists: false } }]
      }
    }
  }).toArray();
  if (!activeMembers.length) return null;

  const creator = creatorId(organization);
  if (creator) {
    const found = activeMembers.find(user => user._id?.toString?.() === creator.toString());
    if (found) return found;
  }

  return activeMembers.find(user =>
    (user.data?.memberships || []).some(membership => isActiveMembership(membership, organizationId) && hasAdminGrant(membership))
  ) || activeMembers[0];
}

async function markOwner(db, user, organizationId) {
  const membership = (user.data?.memberships || []).find(item => isActiveMembership(item, organizationId));
  if (!membership) return false;
  const permissions = mergeOwnerPermissions(membership.permissions || {});
  await db.collection('users').updateOne(
    { _id: user._id, 'data.memberships.organizationId': membership.organizationId },
    {
      $set: {
        'data.memberships.$.owner': true,
        'data.memberships.$.role': membership.role || 'role_admin',
        'data.memberships.$.roleIds': membership.roleIds?.length ? membership.roleIds : ['role_admin'],
        'data.memberships.$.permissions': permissions,
        'data.permissions': permissions
      }
    }
  );
  return true;
}

async function main() {
  const db = await connectDB();
  const organizations = await db.collection('organizations').find({}).toArray();
  let updated = 0;
  let skipped = 0;

  for (const organization of organizations) {
    const existingOwner = await db.collection('users').findOne({
      'data.memberships': {
        $elemMatch: {
          organizationId: { $in: idValues(organization._id) },
          $or: [{ status: 'active' }, { status: { $exists: false } }],
          owner: true
        }
      }
    });
    if (existingOwner) continue;

    const owner = await selectOwnerUser(db, organization);
    if (!owner) {
      skipped += 1;
      console.warn(`No active user found for organization ${organization._id}`);
      continue;
    }
    if (await markOwner(db, owner, organization._id)) updated += 1;
  }

  console.log(`Organization owner migration complete. Updated ${updated}, skipped ${skipped}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
