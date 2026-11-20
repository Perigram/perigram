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
import { resolve } from 'node:path';
import { connectDB } from '../db/mongo.js';
import { normalizeListing } from '#packages/plugin-sdk/listing';
import * as pluginRepository from '../features/plugins/repository.js';
import { prepareListingRelease } from './lib/plugin-runtime-assets.js';
import { buildDocumentsRuntime } from '../../workers/documents/build-runtime.mjs';

const BUILTIN_LISTING_PATHS = [
  'workers/documents/listing.json',
  'workers/tech-drawing/listing.json',
  'workers/nesting/listing.json',
  'workers/facade/listing.json',
  'workers/build123d/listing.json'
];

const paths = process.argv.slice(2).length ? process.argv.slice(2) : BUILTIN_LISTING_PATHS;

// Build the portable browser/server artifact before collecting package assets.
if (paths.some(path => resolve(path) === resolve('workers/documents/listing.json'))) {
  await buildDocumentsRuntime();
}

// Prepare and validate the complete release set before the first database
// write. In particular, a missing runtime source must not leave the catalog
// half-refreshed with a mixture of old and new built-in listings.
const prepared = paths.map(path => {
  const listing = normalizeListing(JSON.parse(readFileSync(path, 'utf8')));
  const packageRoot = resolve('workers', listing.pluginId);
  const assets = prepareListingRelease(listing, packageRoot);
  return { listing, assets };
});

const db = await connectDB();
for (const { listing, assets } of prepared) {
  for (const asset of assets) {
    await pluginRepository.storePluginAsset({
      pluginId: listing.pluginId,
      version: listing.version,
      path: asset.path,
      buffer: asset.buffer,
      contentType: asset.contentType
    });
    console.log(`asset: ${listing.pluginId}@${listing.version}/${asset.path}`);
  }
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
