import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { connectDB } from '../db/mongo.js';
import { getPrimaryState, normalizeStatusLifecycle, normalizeStatusState } from '../../packages/core/src/index.js';

const COLLECTION_ENTITY_TYPES = Object.freeze({
  artifacts: 'artifact',
  cassette_designs: 'cassette_design',
  cassette_instances: 'cassette_instance',
  cassettes: 'cassette',
  catalogs: 'catalog',
  colors: 'color',
  entity_revisions: 'entity_revision',
  geometry_captures: 'geometry_capture',
  layer_standards: 'layer_standard',
  libraries: 'library',
  machines: 'machine',
  material_piles: 'material_pile',
  materials: 'material',
  memberships: 'membership',
  organizations: 'organization',
  pen_templates: 'pen_template',
  process_definitions: 'process_definition',
  profile_templates: 'profile_template',
  projects: 'project',
  queues: 'queue',
  remnants: 'remnant',
  requisitions: 'requisition',
  sheet_designs: 'sheet_design',
  sheet_instances: 'sheet_instance',
  sheets: 'sheet',
  tool_profiles: 'tool_profile',
  users: 'user',
  warehouses: 'warehouse'
});

const ROLE_ENTITY_TYPES = Object.freeze({
  materialPile: 'material_pile',
  parentSheet: 'sheet',
  sheetDesign: 'sheet_design',
  cassetteDesign: 'cassette_design',
  cassetteTemplate: 'cassette',
  geometryCapture: 'geometry_capture',
  toolProfile: 'tool_profile',
  penTemplate: 'pen_template',
  profileTemplate: 'profile_template',
  manufacturer: 'organization'
});

const RELATION_TARGET_TYPES = Object.freeze({
  libraries: 'library',
  library: 'library',
  source: null
});

export function toEntityReference(entityType, entityId, revisionId = null) {
  if (!entityType || entityId === null || entityId === undefined || entityId === '') return null;
  return {
    entityType: normalizeEntityType(entityType),
    entityId: String(entityId),
    ...(revisionId ? { revisionId: String(revisionId) } : {})
  };
}

export function migrateLineage(lineage = {}, { runRevisionById = new Map() } = {}) {
  const source = lineage && typeof lineage === 'object' && !Array.isArray(lineage) ? lineage : {};
  const migrated = {};
  const legacyIds = new Map();
  const legacyRevisionIds = new Map();

  for (const [key, value] of Object.entries(source)) {
    if (value === null || value === undefined || value === '') continue;
    if (key.endsWith('RevisionId')) {
      legacyRevisionIds.set(key.slice(0, -'RevisionId'.length), value);
      continue;
    }
    if (key.endsWith('Id')) {
      legacyIds.set(key.slice(0, -'Id'.length), value);
      continue;
    }
    if (isEntityReference(value)) {
      if (key === 'run') continue;
      migrated[key] = toEntityReference(value.entityType, value.entityId, value.revisionId);
      continue;
    }
    migrated[key] = value;
  }

  const legacyRunId = legacyIds.get('run') || source.run?.entityId || null;
  for (const [role, entityId] of legacyIds) {
    if (role === 'run') continue;
    const revisionId = legacyRevisionIds.get(role);
    migrated[role] = toEntityReference(entityTypeForRole(role), entityId, revisionId);
  }

  if (legacyRunId) {
    const revisionId = runRevisionById.get(String(legacyRunId));
    if (!revisionId) throw new Error(`No queue revision mapping exists for legacy nesting run ${legacyRunId}`);
    const queue = migrated.queue || (isEntityReference(source.queue) ? source.queue : null);
    if (!queue?.entityId) throw new Error(`Legacy nesting run ${legacyRunId} has no queue lineage`);
    migrated.queue = toEntityReference('queue', queue.entityId, revisionId);
  }

  return migrated;
}

export function migrateRelations(relations = {}) {
  if (!relations || typeof relations !== 'object' || Array.isArray(relations)) return {};
  const migrated = {};
  for (const [key, value] of Object.entries(relations)) {
    const values = Array.isArray(value) ? value : [value];
    const refs = values.filter(item => item !== null && item !== undefined).map(item => {
      if (isEntityReference(item)) return toEntityReference(item.entityType, item.entityId, item.revisionId);
      if (item && typeof item === 'object' && item.type && item.id) return toEntityReference(item.type, item.id, item.revisionId);
      const entityType = RELATION_TARGET_TYPES[key];
      if (!entityType) throw new Error(`Legacy relation ${key} has no declared target entity type`);
      return toEntityReference(entityType, item);
    });
    if (refs.length) migrated[key] = refs;
  }
  return migrated;
}

export function migrateDocumentReferences(doc = {}, options = {}) {
  return {
    ...doc,
    lineage: migrateLineage(doc.lineage || {}, options),
    ...(doc.relations ? { relations: migrateRelations(doc.relations) } : {})
  };
}

export function migrateQueueData(data = {}) {
  const migrated = { ...(data || {}) };
  if (!migrated.nestingSettings && migrated.nestingParams) {
    migrated.nestingSettings = migrated.nestingParams;
  }
  delete migrated.nestingParams;
  return migrated;
}

export function migrateWorkflowLineageRoles(value) {
  if (Array.isArray(value)) return value.map(migrateWorkflowLineageRoles);
  if (!value || typeof value !== 'object' || value instanceof Date || value._bsontype === 'ObjectId') return value;

  const migrated = {};
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'lineageKey') continue;
    migrated[key] = migrateWorkflowLineageRoles(nested);
  }
  if (value.lineageKey && !migrated.lineageRole) {
    migrated.lineageRole = legacyLineageRole(value.lineageKey);
  }
  return migrated;
}

export function legacyNestingRevisionId(runId) {
  return `entity-revision-nesting-migrated-${String(runId)}`;
}

export function createLegacyNestingRevision(run, queue, number) {
  const runId = String(run._id);
  const queueId = queue?._id || run.lineage?.queue?.entityId || run.lineage?.queueId;
  if (!queueId) throw new Error(`Legacy nesting run ${runId} has no queue`);
  const revisionId = legacyNestingRevisionId(runId);
  const outcome = legacyRunOutcome(run);
  const timestamp = run.status?.timestamp || run.origin?.timestamp || run.updatedAt || run.createdAt || new Date();
  const snapshot = {
    settings: run.data?.settingsSnapshot || run.data?.params || {},
    results: run.data?.results || run.summary || {},
    layoutData: run.data?.layoutData || run.data?.result || null,
    legacyRunId: runId,
    legacyStatus: getPrimaryState(run.status, 'UNKNOWN')
  };
  const status = activeRevisionStatus(timestamp, `Migrated from nesting run ${runId}`);
  return {
    _id: revisionId,
    identity: {
      uid: revisionId,
      slug: revisionId,
      name: `queue nesting v${number}`,
      serial: '',
      reference: ''
    },
    lineage: {
      ...migrateLineage(queue?.lineage || {}),
      queue: toEntityReference('queue', queueId)
    },
    origin: status,
    status,
    attachments: {},
    data: {
      entityType: 'queue',
      entityId: String(queueId),
      scope: 'nesting',
      number,
      contentHash: `sha256:${crypto.createHash('sha256').update(stableJson({ outcome, snapshot })).digest('hex')}`,
      outcome,
      taskRunId: `legacy:${runId}`,
      snapshot,
      sourceStatus: queue?.status || null,
      reason: 'legacy-nesting-run-migration'
    }
  };
}

export function migrateQueueNestingStatus(queue, runs = []) {
  const ordered = [...runs].sort(compareRunTime);
  const latest = ordered.at(-1) || null;
  const selected = [...ordered].reverse().find(run => getPrimaryState(run.status) === 'CHOSEN') || null;
  const state = selected ? 'SELECTED' : latest ? (legacyRunOutcome(latest) === 'SUCCESS' ? 'REVIEW' : 'ERROR') : 'IDLE';
  const status = queue.status || activeRevisionStatus(new Date(), 'Queue status initialized during migration');
  const statusState = normalizeStatusState(status.state || 'DRAFT');
  statusState.active.nesting = state;
  statusState.regions.nesting = { state, path: [state] };
  return {
    ...status,
    state: statusState,
    lifecycle: {
      ...normalizeStatusLifecycle(status.lifecycle),
      data: {
        ...normalizeStatusLifecycle(status.lifecycle).data,
        activeTaskRunId: null,
        latestRevisionId: latest ? legacyNestingRevisionId(latest._id) : null,
        selectedRevisionId: selected ? legacyNestingRevisionId(selected._id) : null,
        settings: latest?.data?.settingsSnapshot || latest?.data?.params || null
      }
    }
  };
}

export async function runStructuredReferenceMigration({ apply = false, db = null, log = console.log } = {}) {
  const database = db || await connectDB();
  const legacyRuns = await database.collection('nesting_runs').find({}).sort({ createdAt: 1, _id: 1 }).toArray();
  const runRevisionById = new Map(legacyRuns.map(run => [String(run._id), legacyNestingRevisionId(run._id)]));
  const runsByQueue = groupRunsByQueue(legacyRuns);
  const queueById = new Map((await database.collection('queues').find({}).toArray()).map(queue => [String(queue._id), queue]));

  const revisions = [];
  for (const [queueId, runs] of runsByQueue) {
    const queue = queueById.get(queueId);
    if (!queue) throw new Error(`Legacy nesting runs reference missing queue ${queueId}`);
    runs.sort(compareRunTime).forEach((run, index) => revisions.push(createLegacyNestingRevision(run, queue, index + 1)));
  }

  const summary = { apply, revisions: revisions.length, collections: {}, retiredRuns: legacyRuns.length };
  for (const collection of Object.keys(COLLECTION_ENTITY_TYPES)) {
    const documents = collection === 'queues' ? [...queueById.values()] : await database.collection(collection).find({}).toArray();
    const operations = [];
    for (const doc of documents) {
      let migrated = migrateDocumentReferences(doc, { runRevisionById });
      if (collection === 'queues') migrated = {
        ...migrated,
        data: migrateQueueData(migrated.data),
        status: migrateQueueNestingStatus(migrated, runsByQueue.get(String(doc._id)) || [])
      };
      if (collection === 'process_definitions') migrated = {
        ...migrated,
        data: migrateWorkflowLineageRoles(migrated.data)
      };
      if (stableJson(doc) === stableJson(migrated)) continue;
      const { _id, ...replacement } = migrated;
      operations.push({ updateOne: { filter: { _id: doc._id }, update: { $set: replacement } } });
    }
    summary.collections[collection] = operations.length;
    if (apply && operations.length) await database.collection(collection).bulkWrite(operations, { ordered: true });
  }

  const workflowOverrideOperations = (await database.collection('workflow_overrides').find({}).toArray())
    .flatMap(doc => {
      const workflow = migrateWorkflowLineageRoles(doc.workflow);
      if (stableJson(doc.workflow) === stableJson(workflow)) return [];
      return [{ updateOne: { filter: { _id: doc._id }, update: { $set: { workflow } } } }];
    });
  summary.collections.workflow_overrides = workflowOverrideOperations.length;
  if (apply && workflowOverrideOperations.length) {
    await database.collection('workflow_overrides').bulkWrite(workflowOverrideOperations, { ordered: true });
  }

  if (apply && revisions.length) {
    await database.collection('entity_revisions').bulkWrite(revisions.map(revision => ({
      replaceOne: { filter: { _id: revision._id }, replacement: revision, upsert: true }
    })), { ordered: true });
  }
  if (apply) {
    await migrateLegacyStatusEvents(database, runRevisionById);
    await database.collection('nesting_runs').deleteMany({});
    await database.collection('nesting_jobs').deleteMany({});
  }

  log(`${apply ? '[apply]' : '[dry-run]'} structured references: ${JSON.stringify(summary)}`);
  return summary;
}

function isEntityReference(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && value.entityType && value.entityId);
}

function entityTypeForRole(role) {
  return ROLE_ENTITY_TYPES[role] || normalizeEntityType(role);
}

function legacyLineageRole(value) {
  return String(value)
    .replace(/^lineage\./, '')
    .replace(/\.entityId$/, '')
    .replace(/Id$/, '')
    .replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
}

function normalizeEntityType(value) {
  return String(value || '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/-/g, '_').toLowerCase();
}

function legacyRunOutcome(run = {}) {
  return ['COMPLETE', 'CHOSEN'].includes(getPrimaryState(run.status, 'UNKNOWN')) ? 'SUCCESS' : 'FAILURE';
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object' && !(value instanceof Date) && value._bsontype !== 'ObjectId') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value?.toString?.() ?? value);
}

function compareRunTime(left, right) {
  return new Date(left.createdAt || left.origin?.timestamp || 0) - new Date(right.createdAt || right.origin?.timestamp || 0)
    || String(left._id).localeCompare(String(right._id));
}

function groupRunsByQueue(runs = []) {
  const grouped = new Map();
  for (const run of runs) {
    const queueId = run.lineage?.queue?.entityId || run.lineage?.queueId;
    if (!queueId) throw new Error(`Legacy nesting run ${run._id} has no queue lineage`);
    const key = String(queueId);
    grouped.set(key, [...(grouped.get(key) || []), run]);
  }
  return grouped;
}

function activeRevisionStatus(timestamp, note) {
  return {
    state: normalizeStatusState('ACTIVE'),
    userId: 'SYSTEM',
    timestamp: new Date(timestamp),
    metadata: { note },
    eventId: null,
    lifecycle: normalizeStatusLifecycle()
  };
}

async function migrateLegacyStatusEvents(db, runRevisionById) {
  const events = await db.collection('status_events').find({ targetType: 'nesting_run' }).toArray();
  if (!events.length) return;
  await db.collection('status_events').bulkWrite(events.map(event => ({
    updateOne: {
      filter: { _id: event._id },
      update: {
        $set: {
          targetType: 'entity_revision',
          targetId: runRevisionById.get(String(event.targetId)) || legacyNestingRevisionId(event.targetId),
          migrationNote: 'Retained audit event from legacy nesting run'
        }
      }
    }
  })), { ordered: true });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runStructuredReferenceMigration({ apply: process.argv.includes('--apply') });
}
