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
import { ObjectId } from 'mongodb';

// Layer standards data - parametric templates
// defaultPen: system pen name to assign by default (matched at seed time)
const LAYER_STANDARDS = [
  {
    code: "1_1_FACE",
    category: "CONTOUR",
    i18n: {
      ru: { nameTemplate: "Лицо_Кассеты" },
      en: { nameTemplate: "Cassette_Face" }
    },
    parameters: [],
    defaultPen: "Black Solid 0.35mm"
  },
  {
    code: "1_2_UNFOLD",
    category: "CONTOUR",
    i18n: {
      ru: { nameTemplate: "Развертка_кассеты" },
      en: { nameTemplate: "Cassette_Unfold" }
    },
    parameters: [],
    defaultPen: "Black Solid 0.35mm"
  },
  {
    code: "1_3_UNFOLD_BOUNDARY",
    category: "CONTOUR",
    i18n: {
      ru: { nameTemplate: "Габарит_развертки" },
      en: { nameTemplate: "Unfold_Boundary" }
    },
    parameters: [],
    defaultPen: "Black Solid 0.35mm"
  },
  {
    code: "2_1_CUT",
    category: "CUT",
    i18n: {
      ru: { nameTemplate: "Обрезь_{diameter}" },
      en: { nameTemplate: "Cut_{diameter}" }
    },
    parameters: ["diameter"],
    defaultPen: "Red Solid 0.5mm"
  },
  {
    code: "2_2_HOLE",
    category: "CUT",
    i18n: {
      ru: { nameTemplate: "Отверстие_{diameter}" },
      en: { nameTemplate: "Hole_{diameter}" }
    },
    parameters: ["diameter"],
    defaultPen: "Red Solid 0.5mm"
  },
  {
    code: "3_1_BEND",
    category: "BEND",
    i18n: {
      ru: { nameTemplate: "Фрезеровка_{angle}" },
      en: { nameTemplate: "Mill_{angle}" }
    },
    parameters: ["angle"],
    defaultPen: "Blue Dashed 0.25mm"
  },
  {
    code: "3_2_ENGRAVE",
    category: "MARKING",
    i18n: {
      ru: { nameTemplate: "Гравировка" },
      en: { nameTemplate: "Engraving" }
    },
    parameters: [],
    defaultPen: "Green Solid 0.7mm"
  }
];

async function main() {
  console.log('🌱 Seeding layer standards...\n');
  
  try {
    const db = await connectDB();
    
    // Resolve system pen IDs by name
    const systemPens = await db.collection('pen_templates').find({ 'lineage.userId': null }).toArray();
    const penByName = Object.fromEntries(systemPens.map(p => [p.identity?.name, p._id]));

    // Check if standards already exist
    const existingCount = await service.getCount();
    
    if (existingCount > 0) {
      console.log(`⚠️  Layer standards already exist (count: ${existingCount})`);
      console.log('   To reseed, drop the collection first:\n');
      console.log('   use cutkit;');
      console.log('   db.layer_standards.drop();\n');
      process.exit(1);
    }

    // Resolve defaultPenId from pen name
    const resolved = LAYER_STANDARDS.map(s => {
      const { defaultPen, ...rest } = s;
      const penId = defaultPen ? (penByName[defaultPen] || null) : null;
      if (defaultPen && !penId) console.warn(`  ⚠️  Pen not found: "${defaultPen}" for ${s.code}`);
      return { ...rest, defaultPenId: penId };
    });
    
    // Seed standards
    console.log(`📝 Creating ${resolved.length} layer standards...`);
    const ids = await service.seed(resolved);
    
    console.log(`\n✅ Successfully created ${Object.keys(ids).length} layer standards:`);
    
    // Display created standards
    const standards = await service.getAll();
    for (const std of standards) {
      const params = std.parameters?.length > 0 ? ` (params: ${std.parameters.join(', ')})` : '';
      const pen = std.defaultPenId ? systemPens.find(p => p._id.equals(std.defaultPenId))?.identity?.name || std.defaultPenId : 'none';
      console.log(`   - ${std.code}: ${std.i18n?.en?.nameTemplate}${params} (${std.category}) → ${pen}`);
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
