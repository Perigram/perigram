/**
 * Seed Palette Colors
 *
 * Seeds the tech-drawing `color` type's system catalog (SPEC §3 system
 * instances: `organizationId: null` §3 documents in the per-class
 * `files` collection). Re-running upserts by `code` — org shadow rows
 * are never touched.
 *
 *   node server/scripts/seed-palette-colors.js          # dry-run counts
 *   node server/scripts/seed-palette-colors.js --apply  # persist
 */
import { connectDB } from '../db/mongo.js';

const APPLY = process.argv.includes('--apply');

// A compact standard drawing palette (base inks every drawing domain
// starts from; orgs extend or shadow by code).
export const PALETTE_COLORS = [
  { code: 'black', name: 'Black', hex: '#111827' },
  { code: 'white', name: 'White', hex: '#FFFFFF' },
  { code: 'red', name: 'Red', hex: '#DC2626' },
  { code: 'orange', name: 'Orange', hex: '#F97316' },
  { code: 'amber', name: 'Amber', hex: '#D97706' },
  { code: 'yellow', name: 'Yellow', hex: '#FACC15' },
  { code: 'green', name: 'Green', hex: '#16A34A' },
  { code: 'cyan', name: 'Cyan', hex: '#0891B2' },
  { code: 'blue', name: 'Blue', hex: '#2563EB' },
  { code: 'indigo', name: 'Indigo', hex: '#4F46E5' },
  { code: 'violet', name: 'Violet', hex: '#7C3AED' },
  { code: 'slate', name: 'Slate', hex: '#64748B' }
];

export async function seedPaletteColors(db, { apply = APPLY } = {}) {
  const files = db.collection('files');
  const summary = { scanned: PALETTE_COLORS.length, created: 0, updated: 0 };
  const now = new Date().toISOString();
  for (const entry of PALETTE_COLORS) {
    const filter = { type: 'color', organizationId: null, 'fields.code': entry.code };
    const doc = {
      type: 'color',
      typeVersion: 1,
      organizationId: null,
      name: entry.name,
      fields: { code: entry.code, name: entry.name, hex: entry.hex },
      states: { main: 'CREATED' },
      lineage: {},
      updatedAt: now
    };
    const existing = await files.findOne(filter);
    if (!apply) continue;
    if (existing) {
      await files.updateOne(filter, { $set: doc });
      summary.updated += 1;
    } else {
      await files.insertOne({ ...doc, _id: undefined, createdAt: now });
      summary.created += 1;
    }
  }
  return summary;
}

async function main() {
  console.log(`🌱 Seeding palette colors${APPLY ? ' (apply)' : ' (dry run)'}...\n`);
  try {
    const db = await connectDB();
    const summary = await seedPaletteColors(db);
    console.log(`\n✨ Palette colors: ${summary.scanned} scanned, ${summary.created} created, ${summary.updated} updated${APPLY ? '' : ' (dry run — pass --apply to persist)'}`);
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    process.exit(1);
  }
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
