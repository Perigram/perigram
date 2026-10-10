// One-shot v4-draft native migration (SPEC §20). Stored drafts still
// speaking the retired executable vocabulary rewrite to the native species
// per the SPEC §20 kind table. Records the table cannot map faithfully
// (send-to-organization effects, patch algebra, producer-path joins wired
// through removed sockets) are reported, not guessed: their drafts load
// with a loud unknown-kind diagnostic until re-authored.
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
  'record.modifyBlock': 'cts.compose'
});

// Kinds with no faithful species mapping: the script names them so the
// owner re-authors those graphs instead of a migration inventing semantics.
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

function rewriteRecord(record = {}, report) {
  const kind = KIND_MAP[record.kind];
  if (!kind) {
    if (UNMIGRATABLE_KINDS.includes(record.kind)) report.unmigratable.push(record);
    return null;
  }
  const next = { ...record, kind };
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
  if (kind === 'cts.field') {
    // cts.field reads the whole entity; legacy block-relative paths keep
    // working read off the DTO container, so the path carries over as-is.
    if (record.path && !String(record.path).includes('.') && record.block) {
      next.path = `${record.block}.${record.path}`;
    }
  }
  return next;
}

export async function runV4DraftMigration(database, { apply = false } = {}) {
  const db = database || await connectDB();
  const summary = { mode: apply ? 'apply' : 'dry-run', drafts: 0, records: 0, unmigratable: [], failures: [] };
  for await (const doc of db.collection('process_definitions').find({})) {
    const report = { unmigratable: [] };
    const processNodes = doc.data?.processNodes || {};
    let changed = false;
    const next = {};
    for (const [id, record] of Object.entries(processNodes)) {
      const rewritten = rewriteRecord(record || {}, report);
      if (rewritten) {
        next[id] = rewritten;
        summary.records += 1;
        changed = true;
      } else {
        next[id] = record;
      }
    }
    summary.unmigratable.push(...report.unmigratable.map(record => ({
      definitionId: String(doc._id),
      nodeId: record.id,
      kind: record.kind
    })));
    if (!changed) continue;
    summary.drafts += 1;
    if (apply) {
      try {
        await db.collection('process_definitions').updateOne(
          { _id: doc._id },
          { $set: { 'data.processNodes': next, 'data.compiled': null } }
        );
      } catch (error) {
        summary.failures.push({ definitionId: String(doc._id), error: error.message });
      }
    }
  }
  return summary;
}

const invokedDirectly = process.argv[1]?.endsWith('migrate-v4-drafts-native.js');
if (invokedDirectly) {
  const apply = process.argv.includes('--apply');
  runV4DraftMigration(null, { apply }).then(summary => {
    console.log(JSON.stringify(summary, null, 2));
    if (summary.unmigratable.length) {
      console.error('Records with no faithful species mapping (re-author these graphs):');
      for (const item of summary.unmigratable) console.error(`  ${item.definitionId} ${item.nodeId} ${item.kind}`);
    }
    process.exit(0);
  }).catch(error => {
    console.error(error);
    process.exit(1);
  });
}
