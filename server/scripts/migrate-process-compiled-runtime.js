import { connectDB } from '../db/mongo.js';
import { compileProcessDefinition } from '../../packages/processes/src/index.js';
import { cncDomain } from '../../packages/domain-cnc/src/index.js';

function isServiceRoleId(id = '') {
  return String(id).startsWith('service_') || String(id).startsWith('principal_');
}

const QUEUE_WRITE_FIELDS = ['data.job.items', 'data.job.materialPool', 'data.nestingSettings.*'];

function normalizeStaleEntityProfiles(data = {}) {
  if (!data.entityProfiles || typeof data.entityProfiles !== 'object') return data;
  let changed = false;
  const entityProfiles = Object.fromEntries(Object.entries(data.entityProfiles).map(([profileId, profile]) => {
    if (!profile || typeof profile !== 'object') return [profileId, profile];
    const fields = profile.fields || {};
    if (!Array.isArray(fields.write) || !fields.write.includes('data.job.*')) return [profileId, profile];
    const write = fields.write.filter(field => field !== 'data.job.*').concat(QUEUE_WRITE_FIELDS);
    changed = true;
    return [profileId, { ...profile, fields: { ...fields, write } }];
  }));
  return changed ? { ...data, entityProfiles } : data;
}

function normalizeStaleServiceRoles(data = {}) {
  let changed = false;
  const next = { ...data };

  if (next.processNodes && typeof next.processNodes === 'object') {
    next.processNodes = Object.fromEntries(Object.entries(next.processNodes).map(([nodeId, node]) => {
      if (!node || typeof node !== 'object') return [nodeId, node];
      let nodeChanged = false;
      const cleanNode = { ...node };
      if (Array.isArray(cleanNode.access?.grants)) {
        const grants = cleanNode.access.grants.filter(grant => !isServiceRoleId(grant?.roleId));
        if (grants.length !== cleanNode.access.grants.length) {
          cleanNode.access = { ...cleanNode.access, grants };
          nodeChanged = true;
        }
      }
      if (Array.isArray(cleanNode.access?.roleIds)) {
        const roleIds = cleanNode.access.roleIds.filter(roleId => !isServiceRoleId(roleId));
        if (roleIds.length !== cleanNode.access.roleIds.length) {
          cleanNode.access = { ...cleanNode.access, roleIds };
          nodeChanged = true;
        }
      }
      if (Array.isArray(cleanNode.grants)) {
        const grants = cleanNode.grants.filter(grant => !isServiceRoleId(grant?.roleId || grant));
        if (grants.length !== cleanNode.grants.length) {
          cleanNode.grants = grants;
          nodeChanged = true;
        }
      }
      if (nodeChanged) changed = true;
      return [nodeId, cleanNode];
    }));
  }

  if (next.actions && typeof next.actions === 'object') {
    next.actions = Object.fromEntries(Object.entries(next.actions).map(([actionId, action]) => {
      if (!action || typeof action !== 'object') return [actionId, action];
      let actionChanged = false;
      const cleanAction = { ...action };
      if (Array.isArray(cleanAction.access?.grants)) {
        const grants = cleanAction.access.grants.filter(grant => !isServiceRoleId(grant?.roleId));
        if (grants.length !== cleanAction.access.grants.length) {
          cleanAction.access = { ...cleanAction.access, grants };
          actionChanged = true;
        }
      }
      if (Array.isArray(cleanAction.access?.roleIds)) {
        const roleIds = cleanAction.access.roleIds.filter(roleId => !isServiceRoleId(roleId));
        if (roleIds.length !== cleanAction.access.roleIds.length) {
          cleanAction.access = { ...cleanAction.access, roleIds };
          actionChanged = true;
        }
      }
      if (actionChanged) changed = true;
      return [actionId, cleanAction];
    }));
  }

  if (next.screens && typeof next.screens === 'object') {
    next.screens = Object.fromEntries(Object.entries(next.screens).map(([screenId, screen]) => {
      if (!screen || typeof screen !== 'object') return [screenId, screen];
      if (!Array.isArray(screen.roleIds) || !screen.roleIds.some(isServiceRoleId)) return [screenId, screen];
      const roleIds = screen.roleIds.filter(roleId => !isServiceRoleId(roleId));
      changed = true;
      return [screenId, { ...screen, roleIds }];
    }));
  }

  return changed ? next : data;
}

async function loadOrganizationRoles(db, organizationId, processData = {}) {
  const organization = await db.collection('organizations').findOne({ _id: organizationId });
  const orgRoles = organization?.data?.roles || {};
  const roleGrantIds = Object.keys(processData.roleGrants || {});
  if (!roleGrantIds.length) return orgRoles;
  if (!Object.keys(orgRoles).length) {
    return Object.fromEntries(roleGrantIds.map(id => [id, { id, label: id }]));
  }
  return { ...Object.fromEntries(roleGrantIds.filter(id => !orgRoles[id]).map(id => [id, { id, label: id }])), ...orgRoles };
}

function recompileProcessData(data = {}, roles = {}) {
  if (!data.compiled) return data;
  const normalized = normalizeStaleEntityProfiles(normalizeStaleServiceRoles(data));
  return {
    ...normalized,
    compiled: compileProcessDefinition({
      ...normalized,
      compiled: null
    }, cncDomain, { roles })
  };
}

function compiledSignature(compiled = {}) {
  const { activatedAt: _activatedAt, ...semantic } = compiled || {};
  return JSON.stringify(stableValue(semantic));
}

function stableValue(value) {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(stableValue);
  if (value instanceof Date) return value.toISOString();
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

async function main() {
  const db = await connectDB();
  const cursor = db.collection('process_definitions').find({
    'data.compiled': { $exists: true, $ne: null },
    'status.state.primary': 'ACTIVE'
  });
  let scanned = 0;
  let updated = 0;
  const updatedIds = [];
  const unresolved = [];

  for await (const process of cursor) {
    scanned++;
    const organizationId = process.data?.lineage?.organizationId
      || process.lineage?.organizationId;
    try {
      const roles = await loadOrganizationRoles(db, organizationId, process.data || {});
      const nextData = recompileProcessData(process.data || {}, roles);
      if (compiledSignature(nextData.compiled) === compiledSignature(process.data?.compiled)) continue;
      await db.collection('process_definitions').updateOne(
        { _id: process._id },
        { $set: { data: nextData } }
      );
      updated++;
      updatedIds.push(String(process._id));
    } catch (error) {
      unresolved.push({ id: String(process._id), reason: error.message });
    }
  }

  console.log(`Scanned ${scanned} active compiled process definitions; recompiled ${updated}.`);
  if (updatedIds.length) console.log(`Recompiled ids: ${updatedIds.join(', ')}`);
  if (unresolved.length) {
    console.log(`Unresolved ${unresolved.length} process definitions that fail recompilation:`);
    for (const item of unresolved) {
      console.log(`- ${item.id}: ${item.reason}`);
    }
    process.exit(1);
  }
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
