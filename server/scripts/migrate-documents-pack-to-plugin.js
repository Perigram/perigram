// One-way migration (SPEC §Plugin marketplace, owner decision
// 2026-10-17): the documents pack retires into the documents plugin.
// Publishes the built-in listing, installs it for every organization,
// and rewrites stored process definitions' service nodes bound to the
// pack's `documents.csvText` command to the plugin-qualified
// `plugin.documents.csv-text`. Type ids are unchanged, so instances,
// payloads, and process type bindings resolve continuously through the
// swap. No pack disablement is written: the pack no longer exists in
// code.
//
// Plain-node runbook (no Nuxt aliases — installs write directly, the
// facade-migration precedent): run inside the app container after
// seeding, then restart the app so per-org declaration caches rebuild.
//
//   docker compose -f docker-compose.dev.yml exec app \
//     node server/scripts/migrate-documents-pack-to-plugin.js
//   docker compose -f docker-compose.dev.yml restart app
//
// Idempotent: re-running refreshes the catalog pin and the install
// wiring (stale platform executor origins are cleared — the plugin's
// operations all run behind managed runtimes), held pins stay, and
// rewrites only remaining old-command nodes.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { connectDB } from '../db/mongo.js';
import { normalizeListing } from '#packages/plugin-sdk/listing';

const SERVICE_REWRITES = {
  'documents.csvText': 'plugin.documents.csv-text'
};

const listingPath = process.argv[2] || 'workers/documents/listing.json';
const listing = normalizeListing(JSON.parse(readFileSync(listingPath, 'utf8')));



const db = await connectDB();

await db.collection('plugin_catalog').updateOne(
  { pluginId: listing.pluginId },
  { $set: { ...listing, builtin: true, publishedAt: new Date() } },
  { upsert: true }
);
console.log(`catalog: ${listing.pluginId} v${listing.version} (${listing.declarations.types.length} types, ${listing.declarations.services.length} services)`);

const orgs = await db.collection('organizations').find({}, { projection: { _id: 1 } }).toArray();
let installed = 0;
let alreadyInstalled = 0;
let rewrittenDefinitions = 0;
let rewrittenNodes = 0;

for (const org of orgs) {
  const organizationId = String(org._id);
  const existing = await db.collection('plugin_installs').findOne({ organizationId, pluginId: listing.pluginId });
  if (existing) {
    await db.collection('plugin_installs').updateOne(
      { organizationId, pluginId: listing.pluginId },
      { $set: { platformManaged: true }, $unset: { endpoints: '', executorOrigin: '' } }
    );
    alreadyInstalled += 1;
  } else {
    await db.collection('plugin_installs').insertOne({
      organizationId,
      pluginId: listing.pluginId,
      name: listing.name,
      version: listing.version,
      declarations: listing.declarations,
      services: listing.declarations.services,
      requires: listing.requires,
      platformManaged: true,
      connectorToken: randomBytes(24).toString('base64url'),
      installedAt: new Date()
    });
    installed += 1;
  }

  // Service-node rewrites over stored definitions (the facade
  // migration's graph shapes).
  const definitions = await db.collection('process_definitions').find({
    'lineage.organizationId': org._id
  }).toArray();
  for (const definition of definitions) {
    const changed = rewriteDefinition(definition);
    if (changed.nodes > 0) {
      await db.collection('process_definitions').updateOne(
        { _id: definition._id },
        { $set: { graph: definition.graph } }
      );
      rewrittenDefinitions += 1;
      rewrittenNodes += changed.nodes;
    }
  }
}

console.log(`installed for ${installed} organization(s), ${alreadyInstalled} already held the install`);
console.log(`definitions rewritten: ${rewrittenDefinitions} (${rewrittenNodes} service node(s)) — restart the app to rebuild declaration caches`);

function rewriteDefinition(definition) {
  let count = 0;
  const graph = definition.graph || {};
  const nodes = graph.nodes;
  if (Array.isArray(nodes)) {
    for (const node of nodes) count += rewriteNode(node);
  } else if (nodes && typeof nodes === 'object') {
    for (const node of Object.values(nodes)) count += rewriteNode(node);
  }
  if (graph.services && typeof graph.services === 'object') {
    for (const [id, service] of Object.entries(graph.services)) {
      const next = SERVICE_REWRITES[id];
      if (!next) continue;
      delete graph.services[id];
      graph.services[next] = service;
      count += 1;
    }
  }
  return { nodes: count };
}

function rewriteNode(node) {
  if (!node || node.kind !== 'cts.service') return 0;
  const next = SERVICE_REWRITES[node.operator];
  if (!next) return 0;
  node.operator = next;
  return 1;
}

// One-shot scripts hold the mongo driver's monitoring handles open —
// exit explicitly once the work is done.
process.exit(0);
