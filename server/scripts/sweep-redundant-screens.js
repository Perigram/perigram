/**
 * Sweep Redundant Authored Screens
 *
 * Crystallization Phase 4 migration broom: inference owns default
 * stations, and an authored screen that is projection-equal to the
 * station `inferScreensFromRoleGrants` emits is slop — it suppresses an
 * identical inference and must be hand-maintained for nothing. This
 * sweep finds those screens in stored process definitions and deletes
 * them; after the sweep, validation refuses to re-apply them.
 *
 * Reads each org's projected domain (packs + cts_types overlay) and the
 * organization role catalog (organizations.data.roles) directly from
 * Mongo, so it runs under bare node.
 *
 *   node server/scripts/sweep-redundant-screens.js          # dry-run report
 *   node server/scripts/sweep-redundant-screens.js --apply  # delete + best-effort recompile
 */
import dotenv from 'dotenv';
dotenv.config();

import { ObjectId } from 'mongodb';
import { connectDB } from '../db/mongo.js';
import { createTypeRegistry, projectDomainFromView, frameworkTypes } from '../../packages/cts/src/index.js';
import { prepareAuthoredDefinition, detectRedundantScreens, compileProcessDefinition } from '../../packages/processes/src/index.js';
import { documentsPack } from '../../packages/documents/src/index.js';
import { techDrawingPack } from '../../packages/tech-drawing/src/index.js';
import { cncPackContent, cncDomain } from '../../packages/domain-cnc/src/index.js';

const APPLY = process.argv.includes('--apply');
const COLLECTION = 'process_definitions';

// Mirrors server/packs/declarations.js composition order (import-relative
// for bare node), plus the org's stored cts_types overlay.
async function projectedDomainFor(db, organizationId) {
  const registry = createTypeRegistry({ id: `sweep:${organizationId || 'system'}` });
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
      } catch { /* the cts-types feature's stored error, not this sweep's */ }
    }
  }
  return projectDomainFromView(registry, organizationId, cncDomain, { packServices: [] });
}

async function organizationRolesFor(db, organizationId) {
  if (!organizationId) return {};
  // `organizations._id` is an ObjectId; the cache key arrives as string.
  const id = ObjectId.isValid(organizationId) ? new ObjectId(organizationId) : organizationId;
  const org = await db.collection('organizations').findOne({ _id: id });
  return org?.data?.roles || {};
}

async function sweep(db) {
  const summary = { scanned: 0, rewritten: 0, unchanged: 0, failed: 0, rewrites: [], failures: [] };
  // Definitions accumulate (every activation persists); rebuilding the
  // projected domain per document made the sweep take minutes on real
  // data. Domains and role catalogs are cached per organization — the
  // whole corpus sweeps in seconds.
  const domainCache = new Map();
  const rolesCache = new Map();
  const cursor = db.collection(COLLECTION).find({});
  for await (const doc of cursor) {
    summary.scanned += 1;
    const data = doc.data || {};
    if (!data || typeof data !== 'object' || !Object.keys(data.screens || {}).length) {
      summary.unchanged += 1;
      continue;
    }
    const organizationId = doc.lineage?.organizationId?.toString() || null;
    let domain;
    try {
      if (!domainCache.has(organizationId)) {
        domainCache.set(organizationId, await projectedDomainFor(db, organizationId));
      }
      domain = domainCache.get(organizationId);
    } catch (error) {
      summary.failed += 1;
      summary.failures.push(`${doc.identity?.name || doc._id}: domain projection failed: ${error?.message || error}`);
      continue;
    }
    const accepted = prepareAuthoredDefinition(data, domain);
    if (accepted.errors?.length) {
      summary.failed += 1;
      summary.failures.push(`${doc.identity?.name || doc._id}: acceptance failed: ${accepted.errors.join('; ')}`);
      continue;
    }
    if (!rolesCache.has(organizationId)) {
      rolesCache.set(organizationId, await organizationRolesFor(db, organizationId));
    }
    const hits = detectRedundantScreens(accepted.definition, domain, rolesCache.get(organizationId));
    if (!hits.length) {
      summary.unchanged += 1;
      continue;
    }
    const ids = hits.map(hit => hit.id);
    summary.rewrites.push(`${doc.identity?.name || doc._id}: delete ${ids.join(', ')}`);
    if (!APPLY) continue;
    const screens = { ...(data.screens || {}) };
    for (const id of ids) delete screens[id];
    const update = { 'data.screens': screens, updatedAt: new Date() };
    // Best-effort recompile so the active compiled contract drops the
    // slop immediately; an unrelated compile failure still persists the
    // removal (independently correct) and is reported.
    try {
      const compiled = compileProcessDefinition({ ...accepted.definition, screens }, domain, { roles: rolesCache.get(organizationId) });
      update['data.compiled'] = compiled;
    } catch (error) {
      summary.failures.push(`${doc.identity?.name || doc._id}: screens removed but recompile failed: ${error?.message || error}`);
    }
    await db.collection(COLLECTION).updateOne({ _id: doc._id }, { $set: update });
    summary.rewritten += 1;
  }
  return summary;
}

async function main() {
  console.log(`🔧 Sweeping redundant authored screens${APPLY ? ' (apply)' : ' (dry run)'}...\n`);
  try {
    const db = await connectDB();
    const summary = await sweep(db);
    for (const line of summary.rewrites) console.log(`  ✏️  ${line}`);
    for (const line of summary.failures) console.log(`  ⚠️  ${line}`);
    console.log(`\n✨ ${summary.scanned} definitions: ${summary.rewritten} rewritten, ${summary.unchanged} unchanged, ${summary.failed} failed${APPLY ? '' : ' (dry run — pass --apply to persist)'}`);
    if (summary.failed) process.exitCode = 2;
  } catch (error) {
    console.error('\n❌ Sweep failed:', error.message);
    process.exit(1);
  }
}

main();
