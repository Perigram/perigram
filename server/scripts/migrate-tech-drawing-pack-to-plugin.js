// One-way migration (SPEC §Plugin marketplace, owner decision
// 2026-10-17): the tech-drawing pack retires into the tech-drawing
// plugin. Publishes the built-in listing, then installs it for every
// organization — the pack's code mount is gone from the platform, so the
// install re-provides the type ids (unchanged) through the generic
// instance machinery; instances, system catalogue rows, and process
// bindings resolve continuously through the swap. No pack disablement is
// written: the pack no longer exists in code.
//
// Plain-node runbook (no Nuxt aliases — installs write directly, the
// facade-migration precedent): run inside the app container after
// seeding, then restart the app so per-org declaration caches rebuild.
//
//   docker compose -f docker-compose.dev.yml exec app \
//     node server/scripts/migrate-tech-drawing-pack-to-plugin.js
//   docker compose -f docker-compose.dev.yml restart app
//
// Idempotent: re-running refreshes the catalog pin and skips installs
// that already hold.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { connectDB } from '../db/mongo.js';
import { normalizeListing } from '../../packages/plugin-sdk/src/listing.js';

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
  await db.collection('plugin_installs').insertOne({
    organizationId,
    pluginId: listing.pluginId,
    name: listing.name,
    version: listing.version,
    declarations: listing.declarations,
    services: listing.declarations.services,
    requires: listing.requires,
    surfaceOrigin,
    connectorToken: randomBytes(24).toString('base64url'),
    installedAt: new Date()
  });
  installed += 1;
}

console.log(`installed for ${installed} organization(s), ${alreadyInstalled} already held the install — restart the app to rebuild declaration caches`);
