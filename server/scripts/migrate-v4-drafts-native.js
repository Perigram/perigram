// One-shot v4-draft native migration (SPEC §20). Stored drafts still
// speaking the retired effect.* vocabulary rewrite to the native species:
// effect.createEntity -> cts.construct (blocks -> slots, status socket
// defaults -> the flat state default, type ids kebab-cased). After this
// migration no persisted draft depends on the legacy catalog branches.
// Dry-run by default; `--apply` persists. Idempotent.
import { connectDB } from '../db/mongo.js';

const KIND_MAP = Object.freeze({
  'effect.createEntity': 'cts.construct'
});

function rewriteRecord(record = {}) {
  const kind = KIND_MAP[record.kind];
  if (!kind) return null;
  const next = { ...record, kind };
  if (Array.isArray(record.blocks)) {
    next.slots = [...record.blocks];
    delete next.blocks;
  }
  if (record.block) {
    next.slot = record.block;
    delete next.block;
  }
  if (record.typeId) next.typeId = String(record.typeId).replace(/_/g, '-');
  const defaults = { ...(record.inputDefaults || {}) };
  if (defaults['states.main'] !== undefined) {
    defaults.state = defaults.state ?? defaults['states.main'];
    delete defaults['states.main'];
  }
  if (record.state?.to !== undefined && defaults.state === undefined) {
    defaults.state = String(record.state.to);
  }
  if (Object.keys(defaults).length) next.inputDefaults = defaults;
  return next;
}

export async function runV4DraftMigration(database, { apply = false } = {}) {
  const db = database || await connectDB();
  const summary = { mode: apply ? 'apply' : 'dry-run', drafts: 0, records: 0, failures: [] };
  for await (const doc of db.collection('process_definitions').find({})) {
    const processNodes = doc.data?.processNodes || {};
    let changed = false;
    const next = {};
    for (const [id, record] of Object.entries(processNodes)) {
      const rewritten = rewriteRecord(record || {});
      if (rewritten) {
        next[id] = rewritten;
        summary.records += 1;
        changed = true;
      } else {
        next[id] = record;
      }
    }
    if (!changed) continue;
    summary.drafts += 1;
    if (apply) {
      try {
        await db.collection('process_definitions').updateOne(
          { _id: doc._id },
          { $set: { 'data.processNodes': next } }
        );
      } catch (error) {
        summary.failures.push(`${doc._id}: ${error.message}`);
      }
    }
  }
  return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runV4DraftMigration(null, { apply: process.argv.includes('--apply') })
    .then(summary => {
      console.log(JSON.stringify(summary, null, 2));
      process.exitCode = summary.failures.length ? 1 : 0;
    })
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}
