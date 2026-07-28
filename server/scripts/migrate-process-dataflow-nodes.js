import { MongoClient } from 'mongodb';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileProcessDefinition, migrateProcessDataflowDefinition } from '../../packages/processes/src/index.js';
import { cncDomain } from '../../packages/domain-cnc/src/index.js';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/cutkit_dev';
const apply = process.env.APPLY === '1';
const status = process.env.STATUS || '';
const compact = process.env.COMPACT === '1';
const client = new MongoClient(uri);

export function migrateStoredProcessDataflow(data = {}) {
  const migrated = migrateProcessDataflowDefinition(data, cncDomain);
  if (!migrated.changed) return migrated;
  let compiled = null;
  let warnings = [];
  if (data.compiled) {
    compiled = compileProcessDefinition({ ...migrated.value, compiled: null }, cncDomain);
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
    const filter = {
      'data.dataflowVersion': { $ne: 3 },
      ...(status ? { 'status.state.primary': status } : {})
    };
    const cursor = collection.find(filter);
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
      console.error(JSON.stringify(migrationReport({ scanned, updates, uncompiled, invalid }), null, 2));
      process.exitCode = 1;
      return;
    }
    if (apply && updates.length) {
      await collection.bulkWrite(updates.map(update => ({
        updateOne: {
          filter: { _id: update._id, 'data.dataflowVersion': { $ne: 3 } },
          update: { $set: { data: update.data } }
        }
      })), { ordered: true });
    }
    console.log(JSON.stringify(migrationReport({ scanned, updates, uncompiled, invalid: [] }), null, 2));
  } finally {
    await client.close();
  }
}

function migrationReport({ scanned, updates, uncompiled, invalid }) {
  const report = { apply, status: status || 'ALL', scanned, changed: updates.length, uncompiled, invalid };
  if (!compact) return report;
  return {
    ...report,
    uncompiled: summarizeFailures(uncompiled),
    invalid: summarizeFailures(invalid)
  };
}

function summarizeFailures(items = []) {
  return {
    count: items.length,
    processes: items.slice(0, 20).map(item => ({
      ...item,
      errors: (item.errors || []).slice(0, 5)
    })),
    omitted: Math.max(0, items.length - 20)
  };
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

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
