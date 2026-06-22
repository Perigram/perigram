import { connectDB } from '../db/mongo.js';
import { compileProcessDefinition } from '../../packages/processes/src/index.js';
import { cncDomain } from '../../packages/domain-cnc/src/index.js';

function hasCreateActionWithTargetStatus(data = {}) {
  return Object.values(data.actions || {}).some(action => (
    (action.actionKind || 'createEntity') === 'createEntity'
    && action.status?.to
    && action.access?.roleIds?.length
  ));
}

function migrateProcessData(data = {}) {
  if (!data.compiled || !hasCreateActionWithTargetStatus(data)) return data;
  return {
    ...data,
    compiled: compileProcessDefinition({
      ...data,
      compiled: null
    }, cncDomain)
  };
}

async function main() {
  const db = await connectDB();
  const cursor = db.collection('process_definitions').find({
    'data.compiled': { $exists: true, $ne: null },
    'data.actions': { $exists: true }
  });
  let scanned = 0;
  let updated = 0;

  for await (const process of cursor) {
    scanned++;
    const nextData = migrateProcessData(process.data || {});
    if (JSON.stringify(nextData) === JSON.stringify(process.data || {})) continue;
    await db.collection('process_definitions').updateOne(
      { _id: process._id },
      { $set: { data: nextData } }
    );
    updated++;
  }

  console.log(`Scanned ${scanned} process definitions; recompiled ${updated} create-status grants.`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
