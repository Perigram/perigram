import { connectDB } from '../db/mongo.js';
import { compileProcessDefinition } from '../../packages/processes/src/index.js';
import { cncDomain } from '../../packages/domain-cnc/src/index.js';

const APPLY = process.argv.includes('--apply');

export function migrateStatusAction(action = {}) {
  if (action.actionKind !== 'changeStatus') return { ...action };
  const entityType = action.entityType || action.inputs?.find(input => input.entityType)?.entityType || '';
  const inputs = [...(action.inputs || [])];
  if (!inputs.some(input => input.id === 'entity')) {
    inputs.unshift({ id: 'entity', kind: 'entity', entityType, required: true });
  }
  if (!inputs.some(input => input.id === 'status')) {
    inputs.push({
      id: 'status',
      kind: 'status',
      statusRef: action.statusRef || null,
      status: action.status?.to || action.access?.statusTo || '',
      required: false
    });
  }
  return {
    ...action,
    actionKind: 'updateEntity',
    entityType,
    inputs,
    mutation: action.mutation || { fields: [] },
    access: {
      ...(action.access || {}),
      statusFrom: action.access?.statusFrom || action.status?.from || '',
      statusTo: action.access?.statusTo || action.status?.to || ''
    }
  };
}

export function migrateProcessUpdateActions(data = {}) {
  const actions = Object.fromEntries(
    Object.entries(data.actions || {}).map(([id, action]) => [id, migrateStatusAction(action)])
  );
  const changed = JSON.stringify(actions) !== JSON.stringify(data.actions || {});
  const compiledHasLegacyActions = Object.values(data.compiled?.actions || {})
    .some(action => action.actionKind === 'changeStatus');
  if (!changed && !compiledHasLegacyActions) return { data, changed: false };

  const migrated = { ...data, actions, compiled: null };
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
