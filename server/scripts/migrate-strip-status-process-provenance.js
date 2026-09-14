import { connectDB } from '../db/mongo.js';
import { cncDomain } from '../../packages/domain-cnc/src/index.js';

const APPLY = process.argv.includes('--apply');

// Keys that tie an entity status to a specific authored process graph. The
// status engine strips producerOutputId at its write boundary; this list also
// covers provenance written by earlier migrations and runtimes.
export const STATUS_PROVENANCE_KEYS = [
  'processId',
  'processDefinitionId',
  'processRunId',
  'processNodeId',
  'actionId',
  'nodeId',
  'producerOutputId',
  'workflowId'
];

// The command-output-status migration used to embed the owning process id in
// its note text; match that deterministic sentence instead of guessing.
const LEGACY_MIGRATION_NOTE = /^Migrated command output status from active process /;

export function statusProvenancePlan(metadata = {}) {
  if (!metadata || typeof metadata !== 'object') return { keys: [], dropNote: false };
  const keys = STATUS_PROVENANCE_KEYS.filter(key => metadata[key] !== undefined);
  const dropNote = LEGACY_MIGRATION_NOTE.test(String(metadata.note || ''));
  return { keys, dropNote };
}

export function stripStatusProvenance(status = {}) {
  const plan = statusProvenancePlan(status?.metadata);
  if (!plan.keys.length && !plan.dropNote) return { status, changed: false };
  const metadata = { ...(status.metadata || {}) };
  for (const key of plan.keys) delete metadata[key];
  if (plan.dropNote) delete metadata.note;
  const next = { ...status, metadata };
  if (!Object.keys(metadata).length) delete next.metadata;
  return { status: next, changed: true };
}

async function main() {
  const db = await connectDB();
  let scanned = 0;
  let updated = 0;

  for (const entity of cncDomain.entities || []) {
    if (!entity.collection) continue;
    const collection = db.collection(entity.collection);
    const cursor = collection.find({
      $or: [
        ...STATUS_PROVENANCE_KEYS.map(key => ({ [`status.metadata.${key}`]: { $exists: true } })),
        { 'status.metadata.note': LEGACY_MIGRATION_NOTE }
      ]
    });
    for await (const document of cursor) {
      scanned++;
      const { status, changed } = stripStatusProvenance(document.status || {});
      if (!changed) continue;
      if (APPLY) {
        await collection.updateOne({ _id: document._id }, { $set: { status } });
      }
      updated++;
    }
  }

  console.log(`${APPLY ? '' : '[dry-run] '}Scanned ${scanned} entities with status process provenance; ${APPLY ? 'stripped' : 'would strip'} ${updated}. Append-only status_events history is intentionally left untouched.`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
