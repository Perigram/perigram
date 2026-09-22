import { connectDB } from '../server/db/mongo.js';
import { normalizeStatusState, getPrimaryState } from '../packages/core/src/index.js';

const ENTITY_COLLECTIONS = [
  'projects',
  'queues',
  'nesting_runs',
  'cassettes',
  'cassette_instances',
  'material_piles',
  'sheets',
  'remnants',
  'geometry_captures',
  'artifacts',
  'requisitions'
];

const dryRun = process.argv.includes('--dry-run');
const db = await connectDB();

for (const collection of ENTITY_COLLECTIONS) {
  await migrateEntityCollection(collection);
}

await migrateStatusEvents();

async function migrateEntityCollection(collection) {
  const cursor = db.collection(collection).find({
    $or: [
      { 'status.state': { $type: 'string' } },
      { 'origin.state': { $type: 'string' } }
    ]
  });
  let count = 0;
  for await (const doc of cursor) {
    const $set = {};
    if (typeof doc.status?.state === 'string') {
      $set['status.state'] = normalizeStatusState(doc.status.state);
    }
    if (typeof doc.origin?.state === 'string') {
      $set['origin.state'] = normalizeStatusState(doc.origin.state);
    }
    if (!Object.keys($set).length) continue;
    count += 1;
    if (!dryRun) await db.collection(collection).updateOne({ _id: doc._id }, { $set });
  }
  console.log(`${dryRun ? '[dry-run] ' : ''}${collection}: ${count} status documents migrated`);
}

async function migrateStatusEvents() {
  const cursor = db.collection('status_events').find({
    $or: [
      { 'status.state': { $type: 'string' } },
      { fromStatePrimary: { $exists: false } },
      { toStatePrimary: { $exists: false } }
    ]
  });
  let count = 0;
  for await (const event of cursor) {
    const statusState = normalizeStatusState(event.status?.state ?? event.toState ?? 'UNKNOWN');
    const $set = {
      'status.state': statusState,
      fromStatePrimary: event.fromStatePrimary || getPrimaryState(event.fromState, event.fromState || 'UNKNOWN'),
      toStatePrimary: event.toStatePrimary || getPrimaryState(statusState, event.toState || 'UNKNOWN'),
      region: event.region || 'main'
    };
    count += 1;
    if (!dryRun) await db.collection('status_events').updateOne({ _id: event._id }, { $set });
  }
  console.log(`${dryRun ? '[dry-run] ' : ''}status_events: ${count} events migrated`);
}
