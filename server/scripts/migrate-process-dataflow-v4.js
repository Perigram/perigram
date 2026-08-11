import { connectDB } from '../db/mongo.js';
import { compileProcessDefinition, migrateProcessDefinitionV4 } from '../../packages/processes/src/index.js';
import { cncDomain } from '../../packages/domain-cnc/src/index.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  const db = await connectDB();
  const cursor = db.collection('process_definitions').find({ 'data.dataflowVersion': 3 });
  const updates = [];
  const failures = [];
  let scanned = 0;
  for await (const process of cursor) {
    scanned += 1;
    const result = migrateProcessDefinitionV4(process.data || {});
    if (result.errors.length) {
      failures.push({ id: String(process._id), errors: result.errors });
      continue;
    }
    try {
      const organizationId = process.lineage?.organizationId;
      const organization = organizationId
        ? await db.collection('organizations').findOne({ _id: organizationId })
        : null;
      const data = {
        ...result.data,
        compiled: compileProcessDefinition(result.data, cncDomain, { roles: organization?.data?.roles || {} })
      };
      updates.push({ id: process._id, data });
    } catch (error) {
      failures.push({ id: String(process._id), errors: [error.message] });
    }
  }
  if (APPLY && !failures.length) {
    for (const update of updates) await db.collection('process_definitions').updateOne({ _id: update.id }, { $set: { data: update.data } });
  }
  console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', scanned, migratable: updates.length, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(error => {
  console.error(error);
  process.exit(1);
});
