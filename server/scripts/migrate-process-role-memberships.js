import { connectDB } from '../db/mongo.js';

const ACCESS_ORDER = { none: 0, read: 1, write: 2, admin: 3 };

function isProcessRoleId(value) {
  return typeof value === 'string' && value.startsWith('role_');
}

function hasGrant(permissions = {}, feature, level = 'read') {
  const grant = permissions?.[feature];
  const grants = Array.isArray(grant) ? grant : [grant].filter(Boolean);
  return grants.some(item => {
    const actual = typeof item === 'string' ? item : item?.level || item?.access || 'none';
    return (ACCESS_ORDER[actual] || 0) >= (ACCESS_ORDER[level] || 0);
  });
}

function migrateMembership(membership = {}) {
  const roleIds = Array.isArray(membership.roleIds) ? membership.roleIds.filter(Boolean) : [];
  const processRoleIds = roleIds.filter(isProcessRoleId);
  const roleIsProcessRole = isProcessRoleId(membership.role);
  if (!processRoleIds.length && !roleIsProcessRole) return membership;

  const nextRoleIds = processRoleIds.length ? processRoleIds : [membership.role].filter(isProcessRoleId);
  return {
    ...membership,
    role: nextRoleIds[0] || membership.role || '',
    roleIds: nextRoleIds,
    permissions: {}
  };
}

async function main() {
  const db = await connectDB();
  const users = await db.collection('users').find({ 'data.memberships': { $exists: true, $ne: [] } }).toArray();
  let scanned = 0;
  let updated = 0;
  let promoted = 0;

  for (const user of users) {
    scanned++;
    const memberships = user.data?.memberships || [];
    const nextMemberships = memberships.map(migrateMembership);
    if (JSON.stringify(nextMemberships) === JSON.stringify(memberships)) continue;

    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { 'data.memberships': nextMemberships } }
    );
    updated++;
  }

  const refreshedUsers = await db.collection('users').find({ 'data.memberships': { $exists: true, $ne: [] } }).toArray();
  const organizationIds = new Set(refreshedUsers.flatMap(user =>
    (user.data?.memberships || [])
      .filter(membership => membership.status === 'active')
      .map(membership => String(membership.organizationId || ''))
      .filter(Boolean)
  ));

  for (const organizationId of organizationIds) {
    const activeMembers = refreshedUsers
      .map(user => ({
        user,
        index: (user.data?.memberships || []).findIndex(membership =>
          String(membership.organizationId || '') === organizationId && membership.status === 'active'
        )
      }))
      .filter(item => item.index >= 0);
    if (activeMembers.some(item => hasGrant(item.user.data.memberships[item.index].permissions, 'organizations', 'admin'))) continue;

    const manager = activeMembers.find(item => hasGrant(item.user.data.memberships[item.index].permissions, 'users', 'admin'));
    if (!manager) continue;

    const memberships = manager.user.data.memberships || [];
    const nextMemberships = memberships.map((membership, index) => index === manager.index
      ? {
          ...membership,
          permissions: {
            ...(membership.permissions || {}),
            organizations: { level: 'admin' },
            users: membership.permissions?.users || { level: 'admin' }
          }
        }
      : membership);

    await db.collection('users').updateOne(
      { _id: manager.user._id },
      { $set: { 'data.memberships': nextMemberships } }
    );
    promoted++;
  }

  console.log(`Scanned ${scanned} users; migrated ${updated} process-role memberships; promoted ${promoted} tenant admins.`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
