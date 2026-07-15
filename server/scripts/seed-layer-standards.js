/**
 * Seed Layer Standards
 * 
 * Populates the layer_standards collection from the OCCS layer registry.
 * 
 * Usage:
 *   node server/scripts/seed-layer-standards.js
 */

import dotenv from 'dotenv';
dotenv.config();

import { service } from '../features/layer-standards/index.js';
import { connectDB } from '../db/mongo.js';
import { loadOccsLayerStandardSeeds, penTemplateDtoId } from './occs-layer-standards.js';

const LEGACY_LAYER_STANDARD_CODES = [
  '1_1_FACE',
  '1_2_UNFOLD',
  '1_3_UNFOLD_BOUNDARY',
  '2_1_CUT',
  '2_2_HOLE',
  '3_1_BEND',
  '3_2_ENGRAVE',
  'FACADE_EXT'
];

const sameId = (left, right) => left?.toString?.() === right?.toString?.();

async function main() {
  console.log('🌱 Seeding layer standards...\n');
  
  try {
    const db = await connectDB();
    const layerSeeds = await loadOccsLayerStandardSeeds();
    
    // Resolve system pen IDs by name
    const systemPens = await db.collection('pen_templates').find({ 'lineage.user': { $exists: false } }).toArray();
    const penByName = Object.fromEntries(systemPens.map(p => [p.identity?.name, penTemplateDtoId(p)]));

    // Resolve defaultPenId from pen name
    const resolved = layerSeeds.map(s => {
      const { defaultPen, ...rest } = s;
      const penId = defaultPen ? (penByName[defaultPen] || null) : null;
      if (defaultPen && !penId) console.warn(`  ⚠️  Pen not found: "${defaultPen}" for ${s.code}`);
      return { ...rest, defaultPenId: penId };
    });
    
    console.log(`📝 Upserting ${resolved.length} OCCS layer standards...`);
    const ids = await service.seed(resolved);

    const occsCodes = resolved.map(standard => standard.code);
    const cleanup = await db.collection('layer_standards').deleteMany({
      'data.source.registry': { $exists: false },
      $or: [
        { 'data.code': { $in: LEGACY_LAYER_STANDARD_CODES } },
        { code: { $in: [...LEGACY_LAYER_STANDARD_CODES, ...occsCodes] } }
      ]
    });
    if (cleanup.deletedCount > 0) {
      console.log(`🧹 Removed ${cleanup.deletedCount} legacy layer standards`);
    }
    
    console.log(`\n✅ Successfully upserted ${Object.keys(ids).length} layer standards:`);
    
    // Display created standards
    const standards = await service.getAll();
    for (const std of standards) {
      const data = std.data || std;
      const params = data.parameters?.length > 0 ? ` (params: ${data.parameters.join(', ')})` : '';
      const pen = data.defaultPenId
        ? systemPens.find(p => sameId(penTemplateDtoId(p), data.defaultPenId))?.identity?.name || data.defaultPenId
        : 'none';
      console.log(`   - ${data.code}: ${data.i18n?.en?.nameTemplate}${params} (${data.category}) → ${pen}`);
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
