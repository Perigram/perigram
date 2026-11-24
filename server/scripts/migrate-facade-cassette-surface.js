// One-way migration: Facade v51 carries the cassette designer's clean-save
// surface. v48 through v50 declare the same types, services, constructions,
// editors, previews, and runtime as v51, so their pins adopt the current
// listing metadata while the organization's package copy re-materializes
// from the catalog release. Older pins keep their snapshot for the
// explicit upgrade flow.
//
//   node server/scripts/migrate-facade-cassette-surface.js
//   restart the app so per-organization declaration caches rebuild
//
// Idempotent: current installs keep their package state.
import { readFileSync } from 'node:fs';
import { connectDB } from '../db/mongo.js';
import { normalizeListing } from '#packages/plugin-sdk/listing';

const COMPATIBLE_PINS = new Set(['48', '49', '50']);
const listingPath = process.argv[2] || 'workers/facade/listing.json';
const listing = normalizeListing(JSON.parse(readFileSync(listingPath, 'utf8')));
const db = await connectDB();

await db.collection('plugin_catalog').updateOne(
  { pluginId: listing.pluginId },
  { $set: { ...listing, builtin: true, publishedAt: new Date() } },
  { upsert: true }
);
console.log(`catalog: ${listing.pluginId} v${listing.version}`);

const installs = await db.collection('plugin_installs')
  .find({ pluginId: listing.pluginId })
  .toArray();
let adopted = 0;
let skipped = 0;
for (const install of installs) {
  const version = String(install.version || '');
  if (version === String(listing.version)) continue;
  if (!COMPATIBLE_PINS.has(version)) {
    skipped += 1;
    continue;
  }
  await db.collection('plugin_installs').updateOne(
    { _id: install._id },
    {
      $set: {
        name: listing.name,
        version: listing.version,
        declarations: listing.declarations,
        services: listing.declarations.services,
        requires: listing.requires,
        platformManaged: true
      },
      $unset: {
        packageAssets: '',
        assetStorage: ''
      }
    }
  );
  adopted += 1;
}

console.log(`${adopted} organization install(s) adopted v${listing.version}; ${skipped} older pin(s) keep their snapshot`);

process.exit(0);
