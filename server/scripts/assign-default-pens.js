/**
 * Assign Default Pens to Layer Standards
 * 
 * Assigns system pens to layer standards that don't have defaultPenId set
 */

import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from '../db/mongo.js';
import {
  DEFAULT_PEN_BY_OCCS_GROUP,
  DEFAULT_PEN_BY_OCCS_LAYER_CODE,
  penTemplateDtoId
} from './occs-layer-standards.js';

const penName = (pen) => pen.identity?.name || pen.name || pen._id?.toString();
const penStroke = (pen) => pen.data?.stroke || pen.stroke || {};
const standardCode = (standard) => standard.data?.code || standard.code || '';
const standardGroup = (standard) => standard.data?.group || standard.group || standard.data?.category?.toLowerCase();
const defaultPenNameForStandard = (standard) => (
  DEFAULT_PEN_BY_OCCS_LAYER_CODE[standardCode(standard)]
  || DEFAULT_PEN_BY_OCCS_GROUP[standardGroup(standard)]
  || 'OCCS Contour Blue 0.35mm'
);

async function main() {
  console.log('🖊️  Assigning default pens to layer standards...\n');
  
  try {
    const db = await connectDB();
    
    // Get all system pens
    const pens = await db.collection('pen_templates')
      .find({ 'lineage.userId': null })
      .toArray();
    
    if (pens.length === 0) {
      console.error('❌ No system pens found! Run: node server/scripts/seed-system-pens.js');
      process.exit(1);
    }
    
    console.log(`Found ${pens.length} system pens:`);
    pens.forEach(p => console.log(`  - ${penName(p)} (${penStroke(p).color})`));
    console.log();
    
    // Get layer standards without default pens
    const standards = await db.collection('layer_standards')
      .find({ $or: [{ 'data.defaultPenId': null }, { 'data.defaultPenId': { $exists: false } }] })
      .toArray();
    
    if (standards.length === 0) {
      console.log('✅ All layer standards already have default pens assigned');
      process.exit(0);
    }
    
    console.log(`Assigning pens to ${standards.length} layer standards...\n`);
    
    let updated = 0;
    const penByName = Object.fromEntries(pens.map(pen => [penName(pen), pen]));
    for (const standard of standards) {
      const targetPenName = defaultPenNameForStandard(standard);
      const pen = penByName[targetPenName] || pens[0];
      await db.collection('layer_standards').updateOne(
        { _id: standard._id },
        { $set: { 'data.defaultPenId': penTemplateDtoId(pen) } }
      );
      console.log(`  ✅ ${standardCode(standard)}: ${penName(pen)}`);
      updated++;
    }
    
    console.log(`\n✨ Assigned default pens to ${updated} layer standards`);
    
  } catch (error) {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
