// One-shot migration (SPEC §25): stored lifecycle rows move onto their
// explicit state fields. Invitations gain `status` from the retired
// `isActive`/`usedAt`/`revokedAt` facts; rejected memberships are removed
// with their organization role assignments; the retired account
// `isActive` flag is stripped.
//
//   node server/scripts/migrate-lifecycle-status-vocabulary.js          # dry-run counts
//   node server/scripts/migrate-lifecycle-status-vocabulary.js --apply
import { connectDB } from '../db/mongo.js';

const APPLY = process.argv.includes('--apply');

const db = await connectDB();
const now = new Date();

function invitationStatus(invitation) {
  if (invitation.expiresAt && new Date(invitation.expiresAt) <= now) return 'expired';
  if (invitation.revokedAt) return 'revoked';
  if (invitation.usedBy && invitation.usedAt) return 'accepted';
  if (invitation.isActive === true) return 'pending';
  return 'revoked';
}

let invitationsMigrated = 0;
const invitations = await db.collection('invitations').find({}).toArray();
for (const invitation of invitations) {
  const status = invitation.status || invitationStatus(invitation);
  const legacy = Object.hasOwn(invitation, 'isActive');
  if (invitation.status === status && !legacy) continue;
  invitationsMigrated += 1;
  if (!APPLY) continue;
  const update = { status, updatedAt: now };
  await db.collection('invitations').updateOne(
    { _id: invitation._id },
    { $set: update, $unset: { isActive: '' } }
  );
}

let overridesMigrated = 0;
const duplicateActiveOverrides = [];
const activeGroups = await db.collection('workflow_overrides').aggregate([
  { $match: { status: 'ACTIVE' } },
  {
    $group: {
      _id: { organizationId: '$organizationId', typeId: '$typeId' },
      rows: { $push: { _id: '$_id', updatedAt: '$updatedAt', createdAt: '$createdAt' } }
    }
  }
]).toArray();
for (const group of activeGroups) {
  const newestFirst = group.rows.sort((left, right) => (
    new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0)
  ));
  for (const row of newestFirst.slice(1)) duplicateActiveOverrides.push(row._id);
}
const draftOverrides = await db.collection('workflow_overrides').find({ status: 'DRAFT' }).toArray();
overridesMigrated = duplicateActiveOverrides.length + draftOverrides.length;
if (APPLY) {
  if (duplicateActiveOverrides.length) {
    await db.collection('workflow_overrides').updateMany(
      { _id: { $in: duplicateActiveOverrides } },
      { $set: { status: 'ARCHIVED', updatedAt: now } }
    );
  }
  if (draftOverrides.length) {
    await db.collection('workflow_overrides').updateMany(
      { status: 'DRAFT' },
      { $set: { status: 'ARCHIVED', updatedAt: now } }
    );
  }
}

let uploadSessionsMigrated = 0;
const uploadSessions = await db.collection('files_upload_sessions').find({ status: { $exists: false } }).toArray();
for (const session of uploadSessions) {
  uploadSessionsMigrated += 1;
  if (!APPLY) continue;
  const expired = session.createdAt && new Date(session.createdAt).getTime() + 24 * 60 * 60 * 1000 <= now.getTime();
  await db.collection('files_upload_sessions').updateOne(
    { _id: session._id },
    { $set: { status: expired ? 'expired' : 'open', updatedAt: now } }
  );
}

let definitionsMigrated = 0;
const definitions = await db.collection('process_definitions')
  .find({ 'data.migrations.state': { $exists: false } })
  .toArray();
for (const definition of definitions) {
  definitionsMigrated += 1;
  if (!APPLY) continue;
  const migrations = definition.data?.migrations || {};
  const state = migrations.applied
    ? (migrations.applied.failures?.length ? 'incomplete' : 'applied')
    : 'none';
  await db.collection('process_definitions').updateOne(
    { _id: definition._id },
    { $set: { 'data.migrations.state': state } }
  );
}

let membershipsRemoved = 0;
let membershipsBackfilled = 0;
let roleAssignmentsRemoved = 0;
let accountFlagsRemoved = 0;
const users = await db.collection('users').find({}).toArray();
for (const user of users) {
  const memberships = user.data?.memberships || [];
  const rejected = memberships.filter(membership => membership?.status === 'rejected');
  const nonRejected = memberships.filter(membership => membership?.status !== 'rejected');
  const hasMissingStatus = nonRejected.some(membership => !membership?.status);
  const remaining = nonRejected.map(membership => (membership.status ? membership : { ...membership, status: 'active' }));
  const hasAccountFlag = Object.hasOwn(user.data || {}, 'isActive');
  if (!rejected.length && !hasAccountFlag && !hasMissingStatus) continue;

  membershipsRemoved += rejected.length;
  if (hasMissingStatus) membershipsBackfilled += 1;
  if (hasAccountFlag) accountFlagsRemoved += 1;
  if (!APPLY) continue;

  await db.collection('users').updateOne(
    { _id: user._id },
    {
      ...(rejected.length || hasMissingStatus ? { $set: { 'data.memberships': remaining } } : {}),
      ...(hasAccountFlag ? { $unset: { 'data.isActive': '' } } : {})
    }
  );
  for (const membership of rejected) {
    const organizationId = membership.organizationId;
    if (!organizationId) continue;
    const organization = await db.collection('organizations').findOne({ _id: organizationId });
    if (!organization?.data?.roleAssignments?.[String(user._id)]) continue;
    roleAssignmentsRemoved += 1;
    await db.collection('organizations').updateOne(
      { _id: organizationId },
      { $unset: { [`data.roleAssignments.${String(user._id)}`]: '' } }
    );
  }
}

console.log(`${APPLY ? 'Migrated' : 'Would migrate'} ${invitationsMigrated} invitation(s), ${overridesMigrated} workflow override(s), ${uploadSessionsMigrated} upload session(s), ${definitionsMigrated} process definition(s); removed ${membershipsRemoved} rejected membership(s), backfilled ${membershipsBackfilled} user(s), ${roleAssignmentsRemoved} role assignment(s), stripped ${accountFlagsRemoved} account flag(s).`);
