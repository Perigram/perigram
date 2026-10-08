import { connectDB } from '../db/mongo.js';

/**
 * Publishes or updates a plugin catalog listing (SPEC §Plugin
 * marketplace: the catalog is platform-published; orgs never write it).
 *
 * Usage: node server/scripts/plugins-catalog-publish.js <listing.json>
 *
 * The JSON shape:
 * {
 *   "pluginId": "coatings",
 *   "name": "Coatings",
 *   "description": "Coating reference types",
 *   "version": "1",
 *   "declarations": { "types": [ { "id": "coating", "class": "item",
 *     "fields": { "code": { "base": "string" } } } ] }
 * }
 */

const file = process.argv[2];
if (!file) {
  console.error('Usage: node server/scripts/plugins-catalog-publish.js <listing.json>');
  process.exit(1);
}

const { readFileSync } = await import('node:fs');
let listing;
try {
  listing = JSON.parse(readFileSync(file, 'utf8'));
} catch (error) {
  console.error(`Cannot read listing: ${error.message}`);
  process.exit(1);
}

const fail = message => {
  console.error(`Invalid listing: ${message}`);
  process.exit(1);
};
if (!listing.pluginId || typeof listing.pluginId !== 'string') fail('pluginId is required');
if (!listing.name || typeof listing.name !== 'string') fail('name is required');
const types = listing.declarations?.types;
if (!Array.isArray(types) || !types.length) fail('declarations.types must be a non-empty array');
for (const type of types) {
  if (!type?.id || !type?.class) fail(`every type needs id and class (got ${JSON.stringify(type?.id)})`);
}

const db = await connectDB();
await db.collection('plugin_catalog').updateOne(
  { pluginId: listing.pluginId },
  {
    $set: {
      pluginId: listing.pluginId,
      name: listing.name,
      description: listing.description || '',
      version: String(listing.version || '1'),
      declarations: { types },
      publishedAt: new Date()
    }
  },
  { upsert: true }
);
console.log(`Published plugin ${listing.pluginId} v${listing.version || '1'} (${types.length} type(s))`);
process.exit(0);
