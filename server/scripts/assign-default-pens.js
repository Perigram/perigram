/**
 * Assign Default Pens to Layer Standards
 * 
 * Assigns system pens to layer standards that don't have defaultPenId set
 */

import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from '../db/mongo.js';

async function main() {
  console.log('🖊️  Assigning default pens to layer standards...\n');
  
  try {
    const db = await connectDB();
    
    // Get all system pens
    const pens = await db.collection('pen_templates')
      .find({ ownerId: null })
      .toArray();
    
    if (pens.length === 0) {
      console.error('❌ No system pens found! Run: node server/scripts/seed-system-pens.js');
      process.exit(1);
    }
    
    console.log(`Found ${pens.length} system pens:`);
    pens.forEach(p => console.log(`  - ${p.name} (${p.stroke.color})`));
    console.log();
    
    // Get layer standards without default pens
    const standards = await db.collection('layer_standards')
      .find({ $or: [{ defaultPenId: null }, { defaultPenId: { $exists: false } }] })
      .toArray();
    
    if (standards.length === 0) {
      console.log('✅ All layer standards already have default pens assigned');
      process.exit(0);
    }
    
    console.log(`Assigning pens to ${standards.length} layer standards...\n`);
    
    // Assign pens (round-robin)
    let updated = 0;
    for (let i = 0; i < standards.length; i++) {
      const pen = pens[i % pens.length];
      await db.collection('layer_standards').updateOne(
        { _id: standards[i]._id },
        { $set: { defaultPenId: pen._id } }
      );
      console.log(`  ✅ ${standards[i].code}: ${pen.name}`);
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
