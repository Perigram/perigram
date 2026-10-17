// One-way migration (SPEC §Plugin marketplace, owner decision
// 2026-10-17): the tech-drawing pack retires into the tech-drawing
// plugin. Publishes the built-in listing, then installs it for every
// organization — the pack's code mount is gone from the platform, so the
// install re-provides the type ids (unchanged) through the generic
// instance machinery; instances, system catalogue rows, and process
// bindings resolve continuously through the swap. No pack disablement is
// written: the pack no longer exists in code.
//
// Run inside the app container against the dev stack (after seeding):
//   docker compose -f docker-compose.dev.yml exec app \
//     node server/scripts/migrate-tech-drawing-pack-to-plugin.js
//
// Idempotent: re-running refreshes the catalog pin and skips orgs that
// already hold the install.
import { connectDB } from '../db/mongo.js';
import { installFromCatalog } from '../features/plugins/service.js';
import { normalizeListing } from '../../packages/plugin-sdk/src/listing.js';
import { readFileSync } from 'node:fs';

const surfaceOrigin = process.env.TECH_DRAWING_EXECUTOR_URL || 'http://tech-drawing-executor:8792';
const listingPath = process.argv[2] || 'workers/tech-drawing/listing.json';
const listing = normalizeListing(JSON.parse(readFileSync(listingPath, 'utf8')));

const db = await connectDB();

await db.collection('plugin_catalog').updateOne(
  { pluginId: listing.pluginId },
  { $set: { ...listing, builtin: true, publishedAt: new Date() } },
  { upsert: true }
);
console.log(`catalog: ${listing.pluginId} v${listing.version} (${listing.declarations.types.length} types)`);

const orgs = await db.collection('organizations').find({}, { projection: { _id: 1 } }).toArray();
let installed = 0;
let alreadyInstalled = 0;

for (const org of orgs) {
  const organizationId = String(org._id);
  const existing = await db.collection('plugin_installs').findOne({ organizationId, pluginId: listing.pluginId });
  if (existing) {
    alreadyInstalled += 1;
    continue;
  }
  await installFromCatalog({ organizationId, pluginId: listing.pluginId, surfaceOrigin });
  installed += 1;
}

console.log(`installed for ${installed} organization(s), ${alreadyInstalled} already held the install`);
