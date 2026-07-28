import { MongoClient } from 'mongodb';
import { compileProcessDefinition, migrateProcessDataflowDefinition } from '../../packages/processes/src/index.js';
import { cncDomain } from '../../packages/domain-cnc/src/index.js';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/cutkit_dev';
const apply = process.env.APPLY === '1';
const client = new MongoClient(uri);

export function migrateStoredProcessDataflow(data = {}) {
  const migrated = migrateProcessDataflowDefinition(data);
  if (!migrated.changed) return migrated;
  let compiled = null;
  let warnings = [];
  if (data.compiled) {
    try {
      compiled = compileProcessDefinition({ ...migrated.value, compiled: null }, cncDomain);
    } catch (error) {
      if (!error.validation) throw error;
      compiled = data.compiled;
      warnings = error.validation.errors;
    }
  }
  return {
    changed: true,
    warnings,
    value: {
      ...migrated.value,
      compiled
    }
  };
}

async function main() {
  await client.connect();
  try {
    const collection = client.db().collection('process_definitions');
    const cursor = collection.find({
      $or: [
        { 'data.valueInputs': { $type: 'object' } },
        { 'data.processNodes': { $type: 'object' } }
      ]
    });
    let scanned = 0;
    const updates = [];
    const invalid = [];
    const uncompiled = [];
    for await (const process of cursor) {
      scanned += 1;
      try {
        const migrated = migrateStoredProcessDataflow(process.data || {});
        if (migrated.changed) {
          updates.push({ _id: process._id, data: migrated.value });
          if (migrated.warnings?.length) {
            uncompiled.push(processSummary(process, migrated.warnings));
          }
        }
      } catch (error) {
        invalid.push(processSummary(process, error.validation?.errors || [error.message]));
      }
    }
    if (invalid.length) {
      console.error(JSON.stringify({ apply, scanned, changed: updates.length, uncompiled, invalid }, null, 2));
      process.exitCode = 1;
      return;
    }
    if (apply) {
      for (const update of updates) {
        await collection.updateOne({ _id: update._id }, { $set: { data: update.data } });
      }
    }
    console.log(JSON.stringify({ apply, scanned, changed: updates.length, uncompiled, invalid: [] }, null, 2));
  } finally {
    await client.close();
  }
}

function processSummary(process, errors) {
  return {
    id: String(process._id),
    uid: process.identity?.uid || '',
    name: process.identity?.name || '',
    status: process.status?.state?.primary || process.status?.state || '',
    errors
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
