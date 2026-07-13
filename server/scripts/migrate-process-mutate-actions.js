import { connectDB } from '../db/mongo.js';
import { compileProcessDefinition } from '../../packages/processes/src/index.js';
import { cncDomain } from '../../packages/domain-cnc/src/index.js';

export function migrateAction(action = {}) {
  if (!['changeStatus', 'updateEntity'].includes(action.actionKind)) return action;
  const statusMutation = action.actionKind === 'changeStatus';
  return {
    ...action,
    actionKind: 'mutateEntity',
    mutation: {
      ...(action.mutation || {}),
      fields: statusMutation ? [] : (action.mutation?.fields || [])
    }
  };
}

export function migrateProcessData(data = {}) {
  const actions = Object.fromEntries(Object.entries(data.actions || {})
    .map(([id, action]) => [id, migrateAction(action)]));
  const migrated = { ...data, actions, compiled: null };
  if (data.compiled) migrated.compiled = compileProcessDefinition(migrated, cncDomain);
  return migrated;
}

async function main() {
  const db = await connectDB();
  const cursor = db.collection('process_definitions').find({ 'data.actions': { $exists: true } });
  let updated = 0;
  for await (const process of cursor) {
    if (!Object.values(process.data?.actions || {}).some(action => ['changeStatus', 'updateEntity'].includes(action.actionKind))) continue;
    const data = migrateProcessData(process.data || {});
    await db.collection('process_definitions').updateOne({ _id: process._id }, { $set: { data } });
    updated += 1;
  }
  console.log(`Migrated ${updated} process definitions to mutateEntity actions.`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
