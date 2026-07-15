import { ObjectId } from 'mongodb';
import { connectDB } from '../db/mongo.js';
import { createStatus } from '../core/blocks/index.js';
import { createWorkflowState, normalizeWorkflow } from '../../packages/workflows/src/index.js';
import { cncDomain } from '../../packages/domain-cnc/src/index.js';

const DRY_RUN = process.argv.includes('--dry-run');

const collectionByEntityType = new Map(
  (cncDomain.entities || []).map(entity => [entity.type, entity.collection])
);

function normalizeEntityType(type = '') {
  return String(type || '').replace(/-/g, '_');
}

function processOrganizationId(process = {}) {
  return process.lineage?.organizationId
    || process.lineage?.organization
    || process.data?.organizationId
    || process.data?.organization
    || '';
}

function commandOutputStatusMappings(processData = {}) {
  const nodes = processData.graph?.nodes || [];
  const edges = processData.graph?.edges || [];
  const actionIdToNodeIds = new Map();
  const nodeIdToActionId = new Map();

  for (const [actionId] of Object.entries(processData.actions || {})) {
    actionIdToNodeIds.set(String(actionId), new Set([String(actionId)]));
    nodeIdToActionId.set(String(actionId), String(actionId));
  }

  for (const node of nodes) {
    const actionId = String(node.data?.refId || node.id || '');
    const nodeId = String(node.id || '');
    if (!actionId || !nodeId) continue;
    if (!actionIdToNodeIds.has(actionId)) actionIdToNodeIds.set(actionId, new Set());
    actionIdToNodeIds.get(actionId).add(nodeId);
    nodeIdToActionId.set(nodeId, actionId);
  }

  const mappings = [];
  for (const [actionId, action] of Object.entries(processData.actions || {})) {
    if (action?.actionKind !== 'runCommand') continue;
    const sourceNodeIds = actionIdToNodeIds.get(String(actionId)) || new Set([String(actionId)]);
    for (const edge of edges) {
      if (!sourceNodeIds.has(String(edge.source))) continue;
      const targetActionId = nodeIdToActionId.get(String(edge.target)) || String(edge.target);
      const targetAction = processData.actions?.[targetActionId];
      if (targetAction?.actionKind !== 'updateEntity') continue;
      const entityType = normalizeEntityType(
        targetAction.entityType
        || targetAction.inputs?.find(input => input.entityType)?.entityType
        || String(edge.sourceHandle || '').replace(/^output:/, '')
      );
      const targetState = targetAction.status?.to || targetAction.access?.statusTo;
      if (!entityType || !targetState) continue;
      mappings.push({ actionId, entityType, targetState, targetAction });
    }
  }
  return mappings;
}

function processWorkflowStates(workflow = {}) {
  if (!workflow?.initial && !workflow?.regions) return new Set();
  const normalized = normalizeWorkflow(workflow);
  return new Set(Object.keys(normalized.states || {}));
}

function statusDisplayMetadata(workflow = {}, targetState = '') {
  const normalized = normalizeWorkflow(workflow);
  const state = normalized.states?.[targetState] || {};
  const display = {
    ...(state.label ? { label: state.label } : {}),
    ...(state.color || state.severity ? { color: state.color || state.severity } : {}),
    ...(state.severity || state.color ? { severity: state.severity || state.color } : {}),
    ...(state.icon ? { icon: state.icon } : {})
  };
  return Object.keys(display).length ? display : null;
}

function createProcessStatus({ workflow, targetState, actorId, processId, actionId, eventId }) {
  const metadata = {
    note: `Migrated command output status from active process ${processId}`,
    processId,
    actionId,
    migratedBy: 'migrate-process-command-output-statuses'
  };
  const display = statusDisplayMetadata(workflow, targetState);
  if (display) metadata.display = display;
  return JSON.parse(JSON.stringify(createStatus(
    createWorkflowState(workflow, {
      active: { [normalizeWorkflow(workflow).primaryRegion || 'main']: targetState },
      primary: targetState
    }),
    actorId || 'SYSTEM',
    metadata,
    eventId
  )));
}

async function migrateMapping({ db, process, organizationId, mapping }) {
  const collection = collectionByEntityType.get(mapping.entityType);
  const workflow = process.data?.compiled?.workflows?.[mapping.entityType];
  if (!collection || !workflow) return { scanned: 0, updated: 0, skipped: 0 };

  const processStates = processWorkflowStates(workflow);
  if (!processStates.has(mapping.targetState)) return { scanned: 0, updated: 0, skipped: 0 };

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  const cursor = db.collection(collection).find({ 'lineage.organizationId': organizationId });

  for await (const entity of cursor) {
    scanned++;
    const currentState = entity.status?.state?.primary;
    if (processStates.has(currentState)) {
      skipped++;
      continue;
    }

    const eventId = new ObjectId();
    const status = createProcessStatus({
      workflow,
      targetState: mapping.targetState,
      actorId: entity.status?.userId || 'SYSTEM',
      processId: process._id?.toString?.() || process._id,
      actionId: mapping.actionId,
      eventId
    });

    if (!DRY_RUN) {
      await db.collection('status_events').insertOne({
        _id: eventId,
        targetId: entity._id,
        targetType: mapping.entityType,
        fromState: null,
        toState: mapping.targetState,
        fromStatePrimary: currentState || null,
        toStatePrimary: mapping.targetState,
        region: normalizeWorkflow(workflow).primaryRegion || 'main',
        status,
        timestamp: new Date(),
        metadata: status.metadata || {}
      });
      await db.collection(collection).updateOne(
        { _id: entity._id },
        { $set: { status, updatedAt: new Date() } }
      );
    }
    updated++;
  }

  return { scanned, updated, skipped };
}

async function main() {
  const db = await connectDB();
  const cursor = db.collection('process_definitions').find({ 'status.state.primary': 'ACTIVE' });
  let processes = 0;
  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  for await (const process of cursor) {
    const organizationId = processOrganizationId(process);
    if (!organizationId) continue;
    processes++;
    for (const mapping of commandOutputStatusMappings(process.data || {})) {
      const result = await migrateMapping({ db, process, organizationId, mapping });
      scanned += result.scanned;
      updated += result.updated;
      skipped += result.skipped;
    }
  }

  console.log(`${DRY_RUN ? '[dry-run] ' : ''}Scanned ${processes} active processes and ${scanned} command output entities; updated ${updated}; skipped ${skipped}.`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
