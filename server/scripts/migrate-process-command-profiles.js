import { connectDB } from '../db/mongo.js';
import { cncDomain } from '../../packages/domain-cnc/src/index.js';
import {
  compileProcessDefinition,
  requiredEntityProfileTypes,
  validateProcessDefinition
} from '../../packages/processes/src/index.js';
import { getProcessTemplate } from '../features/process-definitions/process-templates.js';

const apply = process.env.APPLY === '1';

export function repairRequiredCommandProfiles(data = {}, domain = cncDomain) {
  const requiredTypes = requiredEntityProfileTypes(data, domain);
  const existingTypes = new Set(Object.values(data.entityProfiles || {}).map(profile => profile.entityType));
  const missingTypes = requiredTypes.filter(entityType => !existingTypes.has(entityType));
  if (!missingTypes.length) return data;

  const templateProfiles = Object.values(getProcessTemplate('contractor').definition.entityProfiles || {});
  const entityProfiles = { ...(data.entityProfiles || {}) };
  const nodes = [...(data.graph?.nodes || [])];
  const anchor = nodes.find(node => {
    const action = data.actions?.[node.data?.refId];
    return action?.actionKind === 'runCommand' && requiredTypes.length
      && domain.commands?.[action.commandId]?.requiredEntityProfiles?.length;
  });

  missingTypes.forEach((entityType, index) => {
    const template = templateProfiles.find(profile => profile.entityType === entityType);
    const id = uniqueProfileId(entityProfiles, nodes, entityType);
    entityProfiles[id] = {
      ...(template || genericProfile(entityType)),
      id,
      allowedRoles: inferredAllowedRoles(data.actions || {}, entityType, requiredTypes, domain)
    };
    nodes.push({
      id,
      type: 'entity',
      position: {
        x: (anchor?.position?.x || 0) + 360,
        y: (anchor?.position?.y || 0) + index * 160
      },
      data: { refId: id, label: entityProfiles[id].label, entityType }
    });
  });

  return {
    ...data,
    graph: { ...(data.graph || {}), nodes },
    entityProfiles,
    compiled: null
  };
}

function inferredAllowedRoles(actions, entityType, requiredTypes, domain) {
  const allowedRoles = { read: [], write: [], admin: [] };
  for (const action of Object.values(actions)) {
    const actionTypes = new Set([
      action.entityType,
      ...(action.inputs || []).map(input => input.entityType),
      ...(action.outputs || []).map(output => output.entityType)
    ].filter(Boolean));
    const commandRequiresType = action.actionKind === 'runCommand'
      && requiredTypes.includes(entityType)
      && requiredEntityProfileTypes({ actions: { action } }, domain).includes(entityType);
    if (!actionTypes.has(entityType) && !commandRequiresType) continue;
    for (const grant of action.access?.grants || []) {
      if (allowedRoles[grant.level] && !allowedRoles[grant.level].includes(grant.roleId)) {
        allowedRoles[grant.level].push(grant.roleId);
      }
    }
  }
  return allowedRoles;
}

function uniqueProfileId(profiles, nodes, entityType) {
  const base = `entity_${entityType}`;
  if (!profiles[base] && !nodes.some(node => node.id === base)) return base;
  let suffix = 2;
  while (profiles[`${base}_${suffix}`] || nodes.some(node => node.id === `${base}_${suffix}`)) suffix++;
  return `${base}_${suffix}`;
}

function genericProfile(entityType) {
  return {
    entityType,
    label: entityType,
    lifecycle: cncDomain.workflows?.[entityType]
      ? { mode: 'domainDefault', workflow: null }
      : { mode: 'defaultCreated', workflow: null },
    fields: { read: ['identity.*', 'status.*', 'lineage.*'], write: [], private: [] },
    relations: [],
    stateVisibility: { publicRegions: ['main'], privateRegions: [], publicStates: [] }
  };
}

async function main() {
  const db = await connectDB();
  const processes = await db.collection('process_definitions').find({}).toArray();
  let changed = 0;
  let invalid = 0;

  for (const process of processes) {
    const data = repairRequiredCommandProfiles(process.data || {});
    if (data === process.data) continue;
    const validation = validateProcessDefinition(data, cncDomain);
    if (!validation.ok) {
      invalid++;
      console.error(`${process._id}: ${validation.errors.join('; ')}`);
      continue;
    }
    const nextData = { ...data, compiled: compileProcessDefinition(data, cncDomain) };
    if (apply) {
      await db.collection('process_definitions').updateOne(
        { _id: process._id },
        { $set: { data: nextData } }
      );
    }
    changed++;
  }

  console.log(`${apply ? 'Updated' : 'Would update'} ${changed} process definitions; skipped ${invalid} invalid definitions.`);
  process.exit(invalid ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
