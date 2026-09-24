/**
 * Seed Facade Patterns
 *
 * Upserts the §3 system facade-pattern rows (organizationId: null — the
 * pack-seeded reference-catalog pattern) cycling the declared `motif` enum
 * values, so every organization's generated facade-pattern list surface
 * carries a real multi-select facet over live data. Row count and value
 * spread are contract-bound: SEED_ROWS > SEARCH_AT so the collection
 * toolbar renders, and cycling keeps every value at >= 2 occurrences so
 * the facet materializes.
 *
 * Usage:
 *   node server/scripts/seed-facade-patterns.js            (dry run)
 *   node server/scripts/seed-facade-patterns.js --apply
 */

import dotenv from 'dotenv';
dotenv.config();

import { ObjectId } from 'mongodb';
import { connectDB } from '../db/mongo.js';
import { cncFileTypes } from '#packages/domain-cnc/src/pack.js';

const TYPE_ID = 'facade-pattern';
// > SEARCH_AT (8): the toolbar renders on volume alone even before the
// facet contributes; cycling 9 over 4 values yields a 3/2/2/2 spread.
const SEED_ROWS = 9;

const patternType = cncFileTypes.find(type => type.id === TYPE_ID);
if (!patternType?.fields?.motif?.values?.length) {
  console.error(`❌ ${TYPE_ID} declares no motif enum; seed nothing (update the pack declaration first).`);
  process.exit(1);
}

const motifs = patternType.fields.motif.values;
const typeVersion = patternType.version || 1;

function seedRows() {
  const counters = new Map();
  const rows = [];
  for (let index = 0; index < SEED_ROWS; index += 1) {
    const motif = motifs[index % motifs.length];
    const seen = (counters.get(motif) || 0) + 1;
    counters.set(motif, seen);
    rows.push({ name: `${motif[0].toUpperCase()}${motif.slice(1)} reference ${seen}`, motif });
  }
  return rows;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const rows = seedRows();
  console.log(`🌱 Seeding ${TYPE_ID} system catalog (${apply ? 'apply' : 'dry run'})...\n`);

  try {
    const db = await connectDB();
    const collection = db.collection('files');
    for (const row of rows) {
      const filter = { type: TYPE_ID, organizationId: null, name: row.name };
      const existing = await collection.findOne(filter);
      const now = new Date().toISOString();
      if (existing) {
        const changed = existing.fields?.motif !== row.motif || existing.typeVersion !== typeVersion;
        if (apply) {
          await collection.updateOne(
            { _id: existing._id },
            { $set: { typeVersion, 'fields.motif': row.motif, updatedAt: now } }
          );
        }
        console.log(`   = ${row.name} (${row.motif})${changed ? ' — updated' : ' — current'}`);
      } else {
        if (apply) {
          await collection.insertOne({
            _id: new ObjectId(),
            type: TYPE_ID,
            typeVersion,
            organizationId: null,
            name: row.name,
            fields: { motif: row.motif },
            states: { main: 'CREATED' },
            lineage: {},
            relations: {},
            createdAt: now,
            updatedAt: now
          });
        }
        console.log(`   + ${row.name} (${row.motif}) — created`);
      }
    }
    console.log(`\n${apply ? '✅' : '👁️ dry run —'} ${rows.length} system ${TYPE_ID} rows${apply ? ' seeded' : ' (re-run with --apply)'}`);
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
