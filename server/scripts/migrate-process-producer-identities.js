import { connectDB } from '../db/mongo.js';
import { cncDomain } from '../../packages/domain-cnc/src/index.js';
import { migrateProducerOutputIdentities } from '../../packages/processes/src/index.js';

const APPLY = process.argv.includes('--apply');

export function migratePersistedProcessProducerIdentities(data = {}, domain = cncDomain) {
  const result = migrateProducerOutputIdentities(data, domain);
  if (result.errors.length) {
    throw new Error(result.errors.join('; '));
  }
  return result;
}

async function main() {
  const db = await connectDB();
  const cursor = db.collection('process_definitions').find({
    'data.dataflowVersion': 4,
    'data.processNodes': { $exists: true }
  });
  const updates = [];
  let scanned = 0;
  let migrated = 0;
  let failed = 0;

  for await (const process of cursor) {
    scanned += 1;
    try {
      const result = migratePersistedProcessProducerIdentities(process.data || {});
      if (!result.changed) continue;
      updates.push({ id: process._id, data: result.data });
      migrated += 1;
    } catch (error) {
      failed += 1;
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

  console.log(`${APPLY ? '[apply]' : '[dry-run]'} Scanned ${scanned} process definitions; migrated ${migrated}; failed ${failed}.`);
  if (failed) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
