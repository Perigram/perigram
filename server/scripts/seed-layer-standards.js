/**
 * Seed Layer Standards
 * 
 * Populates the layer_standards collection with initial data
 * from docs/specs/layers.md
 * 
 * Usage:
 *   node server/scripts/seed-layer-standards.js
 */

import dotenv from 'dotenv';
dotenv.config();

import { service } from '../features/layer-standards/index.js';
import { connectDB } from '../db/mongo.js';

// Layer standards data - parametric templates
const LAYER_STANDARDS = [
  {
    code: "1_1_FACE",
    category: "CONTOUR",
    i18n: {
      ru: { nameTemplate: "Лицо_Кассеты" },
      en: { nameTemplate: "Cassette_Face" }
    },
    parameters: [],
    defaultPenId: null
  },
  {
    code: "1_2_UNFOLD",
    category: "CONTOUR",
    i18n: {
      ru: { nameTemplate: "Развертка_кассеты" },
      en: { nameTemplate: "Cassette_Unfold" }
    },
    parameters: [],
    defaultPenId: null
  },
  {
    code: "1_3_UNFOLD_BOUNDARY",
    category: "CONTOUR",
    i18n: {
      ru: { nameTemplate: "Габарит_развертки" },
      en: { nameTemplate: "Unfold_Boundary" }
    },
    parameters: [],
    defaultPenId: null
  },
  {
    code: "2_1_CUT",
    category: "CUT",
    i18n: {
      ru: { nameTemplate: "Обрезь_{diameter}" },
      en: { nameTemplate: "Cut_{diameter}" }
    },
    parameters: ["diameter"],
    defaultPenId: null
  },
  {
    code: "2_2_HOLE",
    category: "CUT",
    i18n: {
      ru: { nameTemplate: "Отверстие_{diameter}" },
      en: { nameTemplate: "Hole_{diameter}" }
    },
    parameters: ["diameter"],
    defaultPenId: null
  },
  {
    code: "3_1_BEND",
    category: "BEND",
    i18n: {
      ru: { nameTemplate: "Фрезеровка_{angle}" },
      en: { nameTemplate: "Mill_{angle}" }
    },
    parameters: ["angle"],
    defaultPenId: null
  },
  {
    code: "3_2_ENGRAVE",
    category: "MARKING",
    i18n: {
      ru: { nameTemplate: "Гравировка" },
      en: { nameTemplate: "Engraving" }
    },
    parameters: [],
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
      const params = std.parameters?.length > 0 ? ` (params: ${std.parameters.join(', ')})` : '';
      console.log(`   - ${std.code}: ${std.i18n.en.nameTemplate}${params} (${std.category})`);
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
