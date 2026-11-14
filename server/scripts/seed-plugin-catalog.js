// Seed the platform's built-in catalog listings (SPEC §Plugin
// marketplace, owner decision 2026-10-17): the plugins this deployment
// ships publish from their own listing.json files, so a fresh environment
// self-contains its default installs. A deploy runs this after the app is
// up; re-running refreshes the pinned versions (installed organizations
// then see the upgrade in the Plugins page).
//
//   node server/scripts/seed-plugin-catalog.js [listing.json ...]
//
// Without arguments it seeds every built-in listing. Each source is
// validated by the one contract home (@perigram/plugin-sdk parseListing),
// so a broken listing refuses loudly instead of entering the catalog.
import { readFileSync } from 'node:fs';
import { connectDB } from '../db/mongo.js';
import { normalizeListing } from '#packages/plugin-sdk/listing';

const BUILTIN_LISTING_PATHS = [
  'workers/documents/listing.json',
  'workers/tech-drawing/listing.json',
  'workers/facade/listing.json',
  'workers/build123d/listing.json'
];

const paths = process.argv.slice(2).length ? process.argv.slice(2) : BUILTIN_LISTING_PATHS;
const db = await connectDB();

for (const path of paths) {
  const listing = normalizeListing(JSON.parse(readFileSync(path, 'utf8')));
  await db.collection('plugin_catalog').updateOne(
    { pluginId: listing.pluginId },
    { $set: { ...listing, builtin: true, publishedAt: new Date() } },
    { upsert: true }
  );
  console.log(`catalog: ${listing.pluginId} v${listing.version} (${listing.declarations.types.length} types, ${listing.declarations.services.length} services)`);
}

// One-shot scripts hold the mongo driver's monitoring handles open —
// exit explicitly once the work is done.
process.exit(0);
