// One-shot persisted-draft migration for retired node kinds (SPEC §20).
// Stored drafts still speaking retired vocabulary rewrite to current kinds
// per the KIND_MAP. Records the map cannot express faithfully are reported,
// not guessed. Graph surgery handles the two structural rewrites: the
// join→concat handle rename and the wire-law redundancies, whose implicit
// coercions already cover the node, reconnect straight through.
// Dry-run by default; `--apply` persists. Idempotent.
import { connectDB } from '../db/mongo.js';

const KIND_MAP = Object.freeze({
  'effect.createEntity': 'cts.construct',
  'effect.runProducer': 'cts.construct',
  'effect.updateEntity': 'cts.mutate',
  'effect.changeStatus': 'cts.transition',
  'effect.archiveEntity': 'cts.transition',
  'effect.deleteEntity': 'cts.remove',
  'effect.runCommand': 'cts.command',
  'effect.generateAttachment': 'cts.conversion',
  'record.getField': 'cts.field',
  'record.deconstruct': 'cts.decompose',
  'record.getBlock': 'cts.decompose',
  'record.composeBlock': 'cts.compose',
  'record.modifyBlock': 'cts.compose',
  // duplicate consolidation: parse shared cast's evaluator, enum was
  // cast-to-string, and the typed stream join is generic concat with an
  // entityRef element type.
  'value.parse': 'value.cast',
  'value.enum': 'value.cast',
  'cts.join': 'collection.concat'
});

// The wire law already covers these implicitly (entity→entityRef and JSON
// transport coercions), so their nodes reconnect straight through.
const DROP_THROUGH_KINDS = Object.freeze(['value.toEntityRef', 'value.toJson']);

// Kinds with no faithful mapping: reported for re-authoring.
const UNMIGRATABLE_KINDS = Object.freeze([
  'effect.sendEntity',
  'predicate.field',
  'predicate.logic',
  'record.fieldChange',
  'record.mergeChanges',
  'record.applyChanges',
  'record.entityDraft',
  'producer.join'
]);

export async function runV4DraftMigration(database, { apply = false } = {}) {
  const db = database || await connectDB();
  const summary = { mode: apply ? 'apply' : 'dry-run', drafts: 0, records: 0, unmigratable: [], failures: [] };
  for await (const doc of db.collection('process_definitions').find({})) {
    const report = { unmigratable: [] };
    const original = doc.data?.processNodes || {};
    const next = {};
    for (const [id, record] of Object.entries(original)) {
      const rewritten = rewriteRecord(record || {}, report);
      if (rewritten) {
        next[id] = rewritten;
        summary.records += 1;
      } else {
        next[id] = record;
      }
    }
    summary.unmigratable.push(...report.unmigratable.map(record => ({
      definitionId: String(doc._id),
      nodeId: record.id,
      kind: record.kind
    })));

    const graph = structuredClone(doc.data?.graph || { nodes: [], edges: [] });
    let changed = Object.keys(next).length !== Object.keys(original).length
      || Object.entries(next).some(([id, record]) => record !== original[id]);

    // Drop-through nodes disappear; their edges reconnect around them.
    const dropped = new Set(Object.entries(original)
      .filter(([, record]) => DROP_THROUGH_KINDS.includes(record?.kind))
      .map(([id]) => String(id)));
    if (dropped.size) {
      graph.nodes = (graph.nodes || []).filter(node => !dropped.has(String(node.data?.refId || node.id)));
      for (const edge of graph.edges || []) {
        if (dropped.has(String(edge.target))) {
          const incoming = (doc.data?.graph?.edges || []).find(candidate => String(candidate.target) === String(edge.source));
          if (incoming) {
            edge.source = incoming.source;
            edge.sourceHandle = incoming.sourceHandle;
          }
        }
      }
      graph.edges = (graph.edges || []).filter(edge => !dropped.has(String(edge.source)));
      for (const id of dropped) delete next[id];
    }

    // join→concat: primary/secondary handles become left/right, result value.
    for (const edge of graph.edges || []) {
      const target = next[String(edge.target)];
      const source = next[String(edge.source)];
      if (target?.kind === 'collection.concat' && original[String(edge.target)]?.kind === 'cts.join') {
        edge.targetHandle = String(edge.targetHandle || '')
          .replace(/primary$/, 'left')
          .replace(/secondary$/, 'right');
      }
      if (source?.kind === 'collection.concat' && original[String(edge.source)]?.kind === 'cts.join') {
        edge.sourceHandle = String(edge.sourceHandle || '').replace(/result$/, 'value');
      }
    }

    if (!changed && !dropped.size) continue;
    summary.drafts += 1;
    if (apply) {
      try {
        await db.collection('process_definitions').updateOne(
          { _id: doc._id },
          { $set: { 'data.processNodes': next, 'data.graph': graph, 'data.compiled': null } }
        );
      } catch (error) {
        summary.failures.push({ definitionId: String(doc._id), error: error.message });
      }
    }
  }
  return summary;
}

function rewriteRecord(record = {}, report) {
  const kind = KIND_MAP[record.kind];
  if (!kind) {
    if (UNMIGRATABLE_KINDS.includes(record.kind)) report.unmigratable.push(record);
    if (DROP_THROUGH_KINDS.includes(record.kind)) return null;
    return null;
  }
  const next = { ...record, kind };
  if (kind === 'value.cast' && record.kind === 'value.enum') {
    next.base = 'string';
    next.outputType = { base: 'string' };
  }
  if (kind === 'collection.concat' && !next.type?.base) {
    next.type = { base: 'entityRef', nullable: false, ...(record.typeId ? { typeId: record.typeId } : {}) };
  }
  if (next.typeId) next.typeId = String(next.typeId).replace(/_/g, '-');
  const defaults = { ...(record.inputDefaults || {}) };
  // The status socket is `state` on the species; legacy `states.main` and
  // `status` defaults migrate onto it.
  if (defaults['states.main'] !== undefined) {
    defaults.state = defaults.state ?? defaults['states.main'];
    delete defaults['states.main'];
  }
  if (defaults.status !== undefined) {
    defaults.state = defaults.state ?? defaults.status;
    delete defaults.status;
  }
  if (record.state?.to !== undefined && defaults.state === undefined) {
    defaults.state = String(record.state.to);
  }
  if (Object.keys(defaults).length) next.inputDefaults = defaults;
  if (kind === 'cts.conversion' && record.commandId) next.operator = record.commandId;
  if (kind === 'cts.field' && record.path && !String(record.path).includes('.') && record.block) {
    next.path = `${record.block}.${record.path}`;
  }
  return next;
}

const invokedDirectly = process.argv[1]?.endsWith('migrate-v4-drafts-native.js');
if (invokedDirectly) {
  const apply = process.argv.includes('--apply');
  runV4DraftMigration(null, { apply }).then(summary => {
    console.log(JSON.stringify(summary, null, 2));
    if (summary.unmigratable.length) {
      console.error('Records with no faithful mapping (re-author these graphs):');
      for (const item of summary.unmigratable) console.error(`  ${item.definitionId} ${item.nodeId} ${item.kind}`);
    }
    process.exit(0);
  }).catch(error => {
    console.error(error);
    process.exit(1);
  });
}
