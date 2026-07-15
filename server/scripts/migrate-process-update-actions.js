import { connectDB } from '../db/mongo.js';
import { compileProcessDefinition } from '../../packages/processes/src/index.js';
import { cncDomain } from '../../packages/domain-cnc/src/index.js';
import {
  migrateStatusAction,
  normalizeLegacyProcessActions
} from '../features/process-definitions/action-migration.js';

const APPLY = process.argv.includes('--apply');

export { migrateStatusAction };

export function migrateProcessUpdateActions(data = {}) {
  const result = normalizeLegacyProcessActions(data);
  if (!result.changed) return result;

  const migrated = result.data;
  if (data.compiled) migrated.compiled = compileProcessDefinition(migrated, cncDomain);
  return { data: migrated, changed: true };
}

async function main() {
  const db = await connectDB();
  const cursor = db.collection('process_definitions').find({
    $or: [
      { 'data.actions.actionKind': 'changeStatus' },
      { 'data.compiled.actions.actionKind': 'changeStatus' },
      { 'data.actions': { $exists: true } }
    ]
  });
  let scanned = 0;
  let migrated = 0;
  let failed = 0;
  const updates = [];

  for await (const process of cursor) {
    scanned++;
    try {
      const result = migrateProcessUpdateActions(process.data || {});
      if (!result.changed) continue;
      updates.push({ id: process._id, data: result.data });
      migrated++;
    } catch (error) {
      failed++;
      console.error(`Could not migrate process ${process._id}: ${error.message}`);
    }
  }

  if (APPLY && !failed) {
    for (const update of updates) {
      await db.collection('process_definitions').updateOne(
        { _id: update.id },
        { $set: { data: update.data } }
      );
    }
  }

  console.log(`${APPLY ? '[apply] ' : '[dry-run] '}Scanned ${scanned} process definitions; migrated ${migrated}; failed ${failed}.`);
  if (failed) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
