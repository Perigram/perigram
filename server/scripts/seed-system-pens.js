/**
 * Seed System Pens
 */

import { service } from '../features/pen-templates/index.js';
import { connectDB } from '../db/mongo.js';

const SYSTEM_PENS = [
  {
    name: "Black Solid 0.35mm",
    stroke: {
      color: "#000000",
      weight: 0.35,
      pattern: "SOLID"
    }
  },
  {
    name: "Red Solid 0.5mm",
    stroke: {
      color: "#FF0000",
      weight: 0.5,
      pattern: "SOLID"
    }
  },
  {
    name: "Blue Dashed 0.25mm",
    stroke: {
      color: "#0000FF",
      weight: 0.25,
      pattern: "DASHED"
    }
  },
  {
    name: "Green Solid 0.7mm",
    stroke: {
      color: "#00FF00",
      weight: 0.7,
      pattern: "SOLID"
    }
  },
  {
    name: "Gray Dotted 0.25mm",
    stroke: {
      color: "#808080",
      weight: 0.25,
      pattern: "DOTTED"
    }
  }
];

async function main() {
  console.log('🖊️  Seeding system pens...\n');
  
  try {
    await connectDB();
    
    let created = 0;
    for (const penData of SYSTEM_PENS) {
      try {
        await service.create(penData, null);
        console.log(`  ✅ ${penData.name}`);
        created++;
      } catch (error) {
        console.log(`  ⚠️  ${penData.name}: ${error.message}`);
      }
    }
    
    console.log(`\n✨ Created ${created}/${SYSTEM_PENS.length} system pens`);
    
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
