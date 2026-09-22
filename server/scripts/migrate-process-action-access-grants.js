import { connectDB } from '../db/mongo.js';
import { compileProcessDefinition } from '../../packages/processes/src/index.js';
import { cncDomain } from '../../packages/domain-cnc/src/index.js';

function normalizeTriggerMode(mode) {
  if (mode === 'event' || mode === 'system') return 'event';
  return 'manual';
}

function normalizeAccessLevel(level) {
  return ['read', 'write', 'admin'].includes(level) ? level : 'write';
}

function normalizeAccessGrants(action = {}) {
  const level = normalizeAccessLevel(action.access?.level);
  if (Array.isArray(action.access?.grants)) {
    return action.access.grants
      .filter(grant => grant?.roleId)
      .map(grant => ({ roleId: grant.roleId, level: normalizeAccessLevel(grant.level || level) }));
  }
  const triggerRoleIds = Array.isArray(action.trigger?.roleIds) ? action.trigger.roleIds : [];
  const accessRoleIds = Array.isArray(action.access?.roleIds) ? action.access.roleIds : triggerRoleIds;
  return [...new Set(accessRoleIds)].map(roleId => ({ roleId, level }));
}

function normalizeAction(action = {}) {
  const grants = normalizeAccessGrants(action);
  return {
    ...action,
    trigger: {
      mode: normalizeTriggerMode(action.trigger?.mode)
    },
    access: {
      grants,
      stateFrom: action.actionKind === 'updateEntity' ? (action.access?.stateFrom || action.state?.from || '') : (action.access?.stateFrom || ''),
      stateTo: action.actionKind === 'updateEntity' ? (action.access?.stateTo || action.state?.to || '') : (action.access?.stateTo || '')
    }
  };
}

function normalizeService(service = {}) {
  const runPrincipals = Array.isArray(service.access?.runPrincipals)
    ? service.access.runPrincipals
    : (Array.isArray(service.access?.runRoles) ? service.access.runRoles : []);
  const viewPrincipals = Array.isArray(service.access?.viewPrincipals)
    ? service.access.viewPrincipals
    : (Array.isArray(service.access?.viewRoles) ? service.access.viewRoles : []);
  const { runRoles, viewRoles, ...access } = service.access || {};
  return {
    ...service,
    access: {
      ...access,
      runPrincipals,
      viewPrincipals
    }
  };
}

function migrateProcessData(data = {}) {
  const actions = Object.fromEntries(
    Object.entries(data.actions || {}).map(([id, action]) => [id, normalizeAction(action)])
  );
  const services = Object.fromEntries(
    Object.entries(data.services || {}).map(([id, service]) => [id, normalizeService(service)])
  );
  const migrated = {
    ...data,
    actions,
    services,
    compiled: null
  };
  if (data.compiled) migrated.compiled = compileProcessDefinition(migrated, cncDomain);
  return migrated;
}

async function main() {
  const db = await connectDB();
  const cursor = db.collection('process_definitions').find({
    $or: [
      { 'data.actions': { $exists: true } },
      { 'data.compiled.actions': { $exists: true } }
    ]
  });
  let scanned = 0;
  let updated = 0;

  for await (const process of cursor) {
    scanned++;
    const nextData = migrateProcessData(process.data || {});
    if (JSON.stringify(nextData) === JSON.stringify(process.data || {})) continue;
    await db.collection('process_definitions').updateOne(
      { _id: process._id },
      { $set: { data: nextData } }
    );
    updated++;
  }

  console.log(`Scanned ${scanned} process definitions; migrated ${updated} action access contracts.`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
