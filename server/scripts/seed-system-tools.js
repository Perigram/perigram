/**
 * Seed System Tools
 */

import dotenv from 'dotenv';
dotenv.config();

import { service } from '../features/tool-profiles/index.js';
import { connectDB } from '../db/mongo.js';

const SYSTEM_TOOLS = [
  {
    name: "Flat End Mill 3.15mm",
    diameter: 3.15,
    angle: 0
  },
  {
    name: "Flat End Mill 5mm",
    diameter: 5,
    angle: 0
  },
  {
    name: "V-Bit 90° 6mm",
    diameter: 6,
    angle: 90
  },
  {
    name: "V-Bit 60° 6mm",
    diameter: 6,
    angle: 60
  },
  {
    name: "Engraving Bit 0.2mm 30°",
    diameter: 0.2,
    angle: 30
  },
  {
    name: "Drill 5mm",
    diameter: 5,
    angle: 118
  }
];

async function main() {
  console.log('🔧 Seeding system tools...\n');
  
  try {
    await connectDB();
    
    let created = 0;
    for (const toolData of SYSTEM_TOOLS) {
      try {
        await service.create(toolData, null);
        console.log(`  ✅ ${toolData.name} (Ø${toolData.diameter}mm, ${toolData.angle}°)`);
        created++;
      } catch (error) {
        console.log(`  ⚠️  ${toolData.name}: ${error.message}`);
      }
    }
    
    console.log(`\n✨ Created ${created}/${SYSTEM_TOOLS.length} system tools`);
    
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
