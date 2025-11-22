/**
 * Seed Layer Standards
 * 
 * Populates the layer_standards collection with initial data
 * from docs/specs/layers.md
 * 
 * Usage:
 *   node server/scripts/seed-layer-standards.js
 */

import { service } from '../features/layer-standards/index.js';
import { connectDB } from '../db/mongo.js';

// Layer standards data based on docs/specs/layers.md
const LAYER_STANDARDS = [
  {
    code: "1_1_FACE",
    category: "CONTOUR",
    i18n: {
      ru: { name: "Лицо кассеты" },
      en: { name: "Cassette Face" }
    },
    defaultPenId: null  // Will be set after pen templates are created
  },
  {
    code: "1_2_UNFOLD",
    category: "CONTOUR",
    i18n: {
      ru: { name: "Развертка кассеты" },
      en: { name: "Cassette Unfold" }
    },
    defaultPenId: null
  },
  {
    code: "1_3_UNFOLD_BOUNDARY",
    category: "CONTOUR",
    i18n: {
      ru: { name: "Габарит развертки + Ǿ фрезы" },
      en: { name: "Unfold Boundary + Mill Diameter" }
    },
    defaultPenId: null
  },
  {
    code: "2_1_CUT_3_15",
    category: "CUT",
    i18n: {
      ru: { name: "Обрезь 3.15" },
      en: { name: "Cut 3.15mm" }
    },
    defaultPenId: null
  },
  {
    code: "2_2_HOLE_5",
    category: "CUT",
    i18n: {
      ru: { name: "Отверстие 5" },
      en: { name: "Hole 5mm" }
    },
    defaultPenId: null
  },
  {
    code: "3_1_BEND_90",
    category: "BEND",
    i18n: {
      ru: { name: "Фрезеровка 90°" },
      en: { name: "Mill 90°" }
    },
    defaultPenId: null
  },
  {
    code: "3_2_ENGRAVE",
    category: "MARKING",
    i18n: {
      ru: { name: "Гравировка" },
      en: { name: "Engraving" }
    },
    defaultPenId: null
  }
];

async function main() {
  console.log('🌱 Seeding layer standards...\n');
  
  try {
    // Connect to database
    await connectDB();
    
    // Check if standards already exist
    const existingCount = await service.getCount();
    
    if (existingCount > 0) {
      console.log(`⚠️  Layer standards already exist (count: ${existingCount})`);
      console.log('   To reseed, drop the collection first:\n');
      console.log('   use nest2d-v2;');
      console.log('   db.layer_standards.drop();\n');
      process.exit(1);
    }
    
    // Seed standards
    console.log(`📝 Creating ${LAYER_STANDARDS.length} layer standards...`);
    const ids = await service.seed(LAYER_STANDARDS);
    
    console.log(`\n✅ Successfully created ${Object.keys(ids).length} layer standards:`);
    
    // Display created standards
    const standards = await service.getAll();
    for (const std of standards) {
      console.log(`   - ${std.code}: ${std.i18n.en.name} (${std.category})`);
    }
    
    console.log('\n✨ Seeding complete!');
    
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
