import { connectDB } from '../db/mongo.js';

// Owner recovery reads the explicit `owner` flag; memberships whose only
// owner claim is the legacy dual-admin permission shape get the flag.
function hasLegacyOwnerPermissions(membership = {}) {
  const organizations = membership.permissions?.organizations;
  const users = membership.permissions?.users;
  return organizations?.level === 'admin' && users?.level === 'admin';
}

async function main() {
  const db = await connectDB();
  const users = await db.collection('users').find({
    'data.memberships': {
      $elemMatch: {
        owner: { $ne: true },
        'permissions.organizations.level': 'admin',
        'permissions.users.level': 'admin'
      }
    }
  }).toArray();

  let flagged = 0;
  for (const user of users) {
    for (const membership of user.data?.memberships || []) {
      if (membership.owner === true) continue;
      if (['pending', 'rejected'].includes(membership.status)) continue;
      if (!hasLegacyOwnerPermissions(membership)) continue;
      await db.collection('users').updateOne(
        { _id: user._id, 'data.memberships.organizationId': membership.organizationId },
        { $set: { 'data.memberships.$.owner': true } }
      );
      flagged += 1;
    }
  }

  console.log(`Legacy owner-membership migration complete. Flagged ${flagged} membership(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
