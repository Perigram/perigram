// One-way migration: the Nesting listing's graph operation declares browser
// and server execution so the graph editor can author and preview it. The
// runtime source and package paths are unchanged; the install snapshot's
// execution targets move with the listing pin. Existing organization copies
// re-materialize from the catalog release after this script clears the old
// pin's asset manifest.
//
//   node server/scripts/migrate-nesting-browser-runtime.js
//   restart the app so per-organization declaration caches rebuild
//
// Idempotent: installs already on the current pin keep their package state.
import { readFileSync } from 'node:fs';
import { connectDB } from '../db/mongo.js';
import { normalizeListing } from '#packages/plugin-sdk/listing';

const listingPath = process.argv[2] || 'workers/nesting/listing.json';
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
for (const install of installs) {
  if (String(install.version) === String(listing.version)) continue;
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

console.log(`${adopted} organization install(s) adopted v${listing.version}; ${installs.length - adopted} already current`);

process.exit(0);
