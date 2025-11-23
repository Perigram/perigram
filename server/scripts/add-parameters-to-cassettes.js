/**
 * Migration script: Add parameters field to existing cassettes
 */

import { connectDB } from '../db/mongo.js';

async function migrate() {
  console.log('Starting migration: Add parameters to cassettes...');
  
  const db = await connectDB();
  const cassettesCollection = db.collection('cassettes');
  
  // Default parameters for all cassettes
  const defaultParameters = ['A', 'B', 'C', 'D', 'E', 'F', 'horizontal_seam_width'];
  
  // Update all cassettes that don't have parameters field
  const result = await cassettesCollection.updateMany(
    { parameters: { $exists: false } },
    {
      $set: {
        parameters: defaultParameters,
        options: {
          hasIkleHoles: false,
          hasRivetHoles: false,
          allowRotation: true,
          negativeOffset: 0
        }
      }
    }
  );
  
  console.log(`✅ Updated ${result.modifiedCount} cassettes with parameters field`);
  
  // Show updated cassettes
  const cassettes = await cassettesCollection.find({}).toArray();
  console.log(`\nTotal cassettes: ${cassettes.length}`);
  cassettes.forEach(c => {
    console.log(`  - ${c.name}: parameters = ${JSON.stringify(c.parameters)}`);
  });
  
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
