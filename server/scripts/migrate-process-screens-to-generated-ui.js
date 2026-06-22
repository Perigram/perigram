import { connectDB } from '../db/mongo.js';
import { compileProcessDefinition } from '../../packages/processes/src/index.js';
import { normalizeScreenContract } from '../../packages/processes/src/screen-contract.js';
import { cncDomain } from '../../packages/domain-cnc/src/index.js';

function migrateScreen(screen = {}, actionIds = new Set()) {
  const normalized = normalizeScreenContract({
    ...screen,
    kind: 'route',
    sourceRoute: screen.sourceRoute || screen.route || '',
    actions: (screen.actions || []).filter(actionId => actionIds.has(actionId))
  });
  return {
    ...normalized,
    route: screen.route || normalized.route || `/screens/${normalized.id}`,
    sourceRoute: screen.sourceRoute || screen.route || normalized.sourceRoute || ''
  };
}

function migrateProcessData(data = {}) {
  const actionIds = new Set(Object.keys(data.actions || {}));
  const screens = Object.fromEntries(
    Object.entries(data.screens || {}).map(([id, screen]) => [id, migrateScreen({ id, ...screen }, actionIds)])
  );
  const migrated = {
    ...data,
    screens,
    compiled: null
  };
  if (data.compiled) migrated.compiled = compileProcessDefinition(migrated, cncDomain);
  return migrated;
}

async function main() {
  const db = await connectDB();
  const cursor = db.collection('process_definitions').find({
    $or: [
      { 'data.screens': { $exists: true } },
      { 'data.compiled.screens': { $exists: true } }
    ]
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

  console.log(`Scanned ${scanned} process definitions; migrated ${updated} screen UI contracts.`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
