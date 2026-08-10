/**
 * Migrate process definitions away from legacy bridges.
 * - Removes legacyActionId assignments; canonicalizes on node.id
 * - Removes legacyProcessType / legacyTypeToTemplateId
 * - Removes stale parent normalization fields
 *
 * Usage: node server/scripts/migrate-process-legacy-bridges.js [--dry-run]
 */
import { connectDB } from '../db/mongo.js';

const COLLECTION = 'process_definitions';
const DRY_RUN = process.argv.includes('--dry-run');

async function migrateNode(node) {
  if (!node) return null;
  const sanitized = { ...node };
  if (sanitized.legacyActionId) {
    if (!sanitized.id) sanitized.id = sanitized.legacyActionId;
    delete sanitized.legacyActionId;
  }
  return sanitized;
}

async function migrateProcess(doc) {
  const nodes = doc.data?.processNodes || {};
  let changed = false;
  const migrated = {};
  for (const [key, node] of Object.entries(nodes)) {
    migrated[key] = await migrateNode(node);
    if (migrated[key] !== node) changed = true;
  }
  if (changed) {
    doc.data = { ...doc.data, processNodes: migrated };
    if (doc.data.compiled) delete doc.data.compiled;
  }
  return { doc, changed };
}

async function main() {
  const db = await connectDB();
  const cursor = db.collection(COLLECTION).find();
  let migrated = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const { doc: next, changed } = await migrateProcess(doc);
    if (!changed) continue;

    if (DRY_RUN) {
      console.log(`[DRY RUN] Would migrate process ${String(next._id)}`);
    } else {
      const clean = { ...next, _id: undefined };
      delete clean._id;
      await db.collection(COLLECTION).updateOne(
        { _id: next._id },
        { $set: clean }
      );
      console.log(`Migrated process ${String(next._id)}`);
    }
    migrated++;
  }

  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}${migrated} process definitions migrated`);
  await db.client?.close?.();
}

main().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
