import { connectDB } from '../db/mongo.js';
import { compileProcessDefinition } from '../../packages/processes/src/index.js';
import { cncDomain } from '../../packages/domain-cnc/src/index.js';

export function planOrganizationRoleMigration({ organization, processes = [], users = [], invitations = [] } = {}) {
  const active = processes.find(process => process.status?.state?.primary === 'ACTIVE') || null;
  const drafts = processes
    .filter(process => process.status?.state?.primary === 'DRAFT')
    .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0));
  const assignmentSource = active || drafts[0] || null;
  const roleSources = [active, ...drafts].filter(Boolean);
  const roles = {};
  const labelDivergence = [];

  for (const process of roleSources) {
    for (const [roleId, role] of Object.entries(process.data?.roles || {})) {
      if (roles[roleId] && roles[roleId].label !== (role.label || roleId)) {
        labelDivergence.push({ roleId, kept: roles[roleId].label, ignored: role.label || roleId, processId: String(process._id) });
        continue;
      }
      roles[roleId] ||= { id: roleId, label: role.label || roleId };
    }
  }

  for (const [roleId, role] of Object.entries(organization.data?.roles || {})) {
    roles[roleId] ||= { id: roleId, label: role.label || roleId };
  }

  const roleAssignments = Object.fromEntries(Object.entries({
    ...(organization.data?.roleAssignments || {}),
    ...(assignmentSource?.data?.assignments || {})
  }).map(([userId, assignment]) => [String(userId), {
    userId: String(userId),
    roleIds: [...new Set(assignment.roleIds || [])],
    bindings: assignment.bindings && typeof assignment.bindings === 'object' ? assignment.bindings : {}
  }]));
  const organizationId = String(organization._id || '');
  for (const user of users) {
    if (roleAssignments[String(user._id)]) continue;
    const membership = (user.data?.memberships || []).find(item => (
      String(item.organizationId || '') === organizationId && item.roleId
    ));
    if (!membership) continue;
    roleAssignments[String(user._id)] = {
      userId: String(user._id),
      roleIds: [String(membership.roleId)],
      bindings: {}
    };
  }
  const knownUserIds = new Set(users.map(user => String(user._id)));
  const unresolved = [
    ...Object.values(roleAssignments).flatMap(assignment => assignment.roleIds.filter(roleId => !roles[roleId]).map(roleId => `assignment ${assignment.userId} -> ${roleId}`)),
    ...Object.values(roleAssignments).filter(assignment => !knownUserIds.has(assignment.userId)).map(assignment => `assignment user ${assignment.userId}`),
    ...invitations.flatMap(invitation => (invitation.roleIds || []).filter(roleId => !roles[roleId]).map(roleId => `invitation ${invitation._id} -> ${roleId}`))
  ];

  return { organization, processes, users, invitations, roles, roleAssignments, labelDivergence, unresolved };
}

export function migrateProcessData(data = {}, roles = {}, status = '') {
  const roleGrants = { ...(data.roleGrants || {}) };
  for (const [roleId, role] of Object.entries(data.roles || {})) {
    if (Array.isArray(role.grants)) roleGrants[roleId] = role.grants;
  }
  const next = { ...data, roleGrants };
  delete next.roles;
  delete next.assignments;
  if (status === 'DRAFT') next.compiled = null;
  if (status === 'ACTIVE') next.compiled = compileProcessDefinition({ ...next, compiled: null }, cncDomain, { roles });
  return next;
}

export function migrateUserData(data = {}) {
  const next = { ...data };
  delete next.role;
  delete next.roleIds;
  delete next.bindings;
  next.memberships = (next.memberships || []).map(membership => {
    const clean = { ...membership };
    delete clean.role;
    delete clean.roleId;
    delete clean.roleIds;
    delete clean.bindings;
    return clean;
  });
  return next;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const db = await connectDB();
  const [organizations, processes, users, invitations] = await Promise.all([
    db.collection('organizations').find({}).toArray(),
    db.collection('process_definitions').find({}).toArray(),
    db.collection('users').find({}).toArray(),
    db.collection('invitations').find({}).toArray()
  ]);
  const reports = [];

  for (const organization of organizations) {
    const organizationId = String(organization._id);
    const orgProcesses = processes.filter(item => String(item.lineage?.organizationId || '') === organizationId);
    const orgUsers = users.filter(user => (user.data?.memberships || []).some(membership => String(membership.organizationId || '') === organizationId));
    const orgInvitations = invitations.filter(invitation => String(invitation.organizationId || '') === organizationId && invitation.isActive);
    const plan = planOrganizationRoleMigration({ organization, processes: orgProcesses, users: orgUsers, invitations: orgInvitations });
    reports.push({ organizationId, roles: Object.keys(plan.roles).length, assignments: Object.keys(plan.roleAssignments).length, labelDivergence: plan.labelDivergence, unresolved: plan.unresolved });
    if (!apply || plan.unresolved.length) continue;

    await db.collection('organizations').updateOne({ _id: organization._id }, {
      $set: { 'data.roles': plan.roles, 'data.roleAssignments': plan.roleAssignments }
    });
    for (const item of orgProcesses) {
      const status = item.status?.state?.primary || '';
      await db.collection('process_definitions').updateOne({ _id: item._id }, {
        $set: { data: migrateProcessData(item.data || {}, plan.roles, status) }
      });
    }
    for (const user of orgUsers) {
      await db.collection('users').updateOne({ _id: user._id }, { $set: { data: migrateUserData(user.data || {}) } });
    }
    for (const invitation of orgInvitations) {
      await db.collection('invitations').updateOne({ _id: invitation._id }, { $unset: { role: '' } });
    }
  }

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', organizations: reports }, null, 2));
  if (reports.some(report => report.unresolved.length)) process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
