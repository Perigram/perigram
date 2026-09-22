/**
 * Migrate Construction Modes
 *
 * Persists the construct-mode hygiene re-bind into stored process
 * definitions (SPEC §20 contract migration): create nodes whose
 * construction mode the type no longer declares are rewritten to the
 * type's current default mode — genericCreate on cassette/sketch becomes
 * editor, on upload types upload. Derived-type create nodes are reported,
 * not rewritten (an authoring change, not a mode swap).
 *
 * Runs the same acceptance seam the server uses (prepareAuthoredDefinition
 * over the organization's projected domain) to resolve the target modes,
 * then writes the re-bound mode back into the authored vocabulary
 * (`via` on cts.construct nodes, `construction.mode` on v4 records).
 *
 *   node server/scripts/migrate-construction-modes.js          # dry-run report
 *   node server/scripts/migrate-construction-modes.js --apply  # persist
 */
import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from '../db/mongo.js';
import { createTypeRegistry, projectDomainFromView, frameworkTypes } from '../../packages/cts/src/index.js';
import { prepareAuthoredDefinition } from '../../packages/processes/src/index.js';
import { documentsPack } from '../../packages/documents/src/index.js';
import { techDrawingPack } from '../../packages/tech-drawing/src/index.js';
import { cncPackContent, cncDomain } from '../../packages/domain-cnc/src/index.js';

const APPLY = process.argv.includes('--apply');
const COLLECTION = 'process_definitions';

// Org-authored declarations are read straight from the cts_types
// collection (the feature repository imports Nuxt aliases a bare-node
// script cannot resolve); stored org types that no longer compile are
// the cts-types feature's error, not this migration's.
async function projectedDomainFor(db, organizationId) {
  const registry = createTypeRegistry({ id: `migrate:${organizationId || 'system'}` });
  // The mounted packs' declarations in composition order, mirroring
  // server/packs/declarations.js (kept import-relative so the script runs
  // under bare node).
  for (const declaration of [
    ...frameworkTypes,
    ...documentsPack.types,
    ...techDrawingPack.types,
    ...cncPackContent.types
  ]) registry.defineType(declaration);
  if (organizationId) {
    const stored = await db.collection('cts_types').find({ organizationId }).toArray();
    for (const declaration of stored) {
      try {
        registry.defineType(declaration);
      } catch { /* see above */ }
    }
  }
  return projectDomainFromView(registry, organizationId, cncDomain, { packServices: [] });
}

// Resolve the re-bound mode for one definition through the acceptance
// seam. Returns { byNodeId, errors } — node ids map to their lowered
// construction mode (null when unchanged or not a create node).
function reboundModes(data, domain) {
  const result = { byNodeId: {}, errors: [] };
  let accepted;
  try {
    ({ definition: accepted, errors: result.errors } = prepareAuthoredDefinition(data, domain));
  } catch (error) {
    result.errors = [error?.message || String(error)];
    return result;
  }
  if (result.errors.length) return result;
  const authoredNodes = (data.processNodes || {});
  for (const [id, lowered] of Object.entries(accepted.processNodes || {})) {
    if (lowered.kind !== 'effect.createEntity') continue;
    const authored = authoredNodes[id] || {};
    const persistedMode = authored.construction?.mode ?? authored.via;
    if (persistedMode === lowered.construction?.mode) continue;
    result.byNodeId[id] = lowered.construction?.mode || null;
  }
  return result;
}

export async function migrateConstructionModes(db, { apply = APPLY } = {}) {
  const summary = { scanned: 0, rewritten: 0, unchanged: 0, failed: 0, rewrites: [], failures: [] };
  const cursor = db.collection(COLLECTION).find({});
  for await (const doc of cursor) {
    summary.scanned += 1;
    const data = doc.data || {};
    if (!data || typeof data !== 'object' || !Object.keys(data.processNodes || {}).length) {
      summary.unchanged += 1;
      continue;
    }
    let domain;
    try {
      domain = await projectedDomainFor(db, doc.lineage?.organizationId?.toString() || null);
    } catch (error) {
      summary.failed += 1;
      summary.failures.push(`${doc.identity?.name || doc._id}: domain projection failed: ${error?.message || error}`);
      continue;
    }
    const { byNodeId, errors } = reboundModes(data, domain);
    if (errors.length) {
      summary.failed += 1;
      summary.failures.push(`${doc.identity?.name || doc._id}: ${errors.join('; ')}`);
      continue;
    }
    const ids = Object.keys(byNodeId);
    if (!ids.length) {
      summary.unchanged += 1;
      continue;
    }
    summary.rewrites.push(`${doc.identity?.name || doc._id}: ${ids.map(id => `${id} -> ${byNodeId[id] || '(none)'}`).join(', ')}`);
    if (!apply) continue;
    const processNodes = { ...data.processNodes };
    for (const id of ids) {
      const node = { ...processNodes[id] };
      node.construction = { ...(node.construction || {}), mode: byNodeId[id] };
      if (node.via !== undefined) delete node.via;
      processNodes[id] = node;
    }
    await db.collection(COLLECTION).updateOne(
      { _id: doc._id },
      { $set: { 'data.processNodes': processNodes, updatedAt: new Date() } }
    );
    summary.rewritten += 1;
  }
  return summary;
}

async function main() {
  console.log(`🔧 Migrating construction modes${APPLY ? ' (apply)' : ' (dry run)'}...\n`);
  try {
    const db = await connectDB();
    const summary = await migrateConstructionModes(db);
    for (const line of summary.rewrites) console.log(`  ✏️  ${line}`);
    for (const line of summary.failures) console.log(`  ⚠️  ${line}`);
    console.log(`\n✨ ${summary.scanned} definitions: ${summary.rewritten} rewritten, ${summary.unchanged} unchanged, ${summary.failed} failed${APPLY ? '' : ' (dry run — pass --apply to persist)'}`);
    if (summary.failed) process.exitCode = 2;
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
  process.exit();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
