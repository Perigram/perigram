import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { connectDB } from '../db/mongo.js';
import { normalizeListing } from '../../packages/plugin-sdk/src/listing.js';

// One-way migration: the facade pack becomes the facade plugin (SPEC
// §Plugin marketplace — owner decision 2026-10-10). For every
// organization: disable the mounted pack, install the pinned plugin
// snapshot from the published listing, and rewrite stored process
// definitions' service-node bindings from the pack service ids to the
// plugin-qualified ones. Type ids are unchanged, so instances, lineage,
// and process type bindings resolve continuously through the swap.
//
// Run inside the app container against the dev stack:
//   docker compose -f docker-compose.dev.yml exec app \
//     node server/scripts/migrate-facade-pack-to-plugin.js
//
// Idempotent: re-running refreshes the catalog pin and skips installs and
// rewrites that already hold.

const SERVICE_REWRITES = {
  'nesting.solve': 'plugin.facade.nesting-solve'
};

const listingPath = process.argv[2] || 'workers/facade/listing.json';
const listing = normalizeListing(JSON.parse(readFileSync(listingPath, 'utf8')));

const db = await connectDB();

await db.collection('plugin_catalog').updateOne(
  { pluginId: listing.pluginId },
  { $set: { ...listing, publishedAt: new Date() } },
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

  await db.collection('pack_disablements').updateOne(
    { organizationId, packId: 'facade' },
    { $set: { organizationId, packId: 'facade', disabledAt: new Date(), disabledBy: 'migration:facade-plugin', reason: 'pack became plugin' } },
    { upsert: true }
  );

  const existing = await db.collection('plugin_installs').findOne({ organizationId, pluginId: listing.pluginId });
  if (existing) {
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
      connectorToken: randomBytes(24).toString('base64url'),
      installedAt: new Date()
    });
    installed += 1;
  }

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

console.log(`orgs: ${orgs.length} — installed: ${installed} (already: ${alreadyInstalled})`);
console.log(`definitions rewritten: ${rewrittenDefinitions} (${rewrittenNodes} service node(s))`);
process.exit(0);

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
