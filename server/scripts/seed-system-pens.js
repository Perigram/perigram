/**
 * Seed System Pens
 */

import dotenv from 'dotenv';
dotenv.config();

import { service } from '../features/pen-templates/index.js';
import { connectDB } from '../db/mongo.js';

export const SYSTEM_PENS = [
  {
    name: "OCCS Contour Blue 0.35mm",
    stroke: {
      color: "#2563EB",
      weight: 0.35,
      pattern: "SOLID"
    }
  },
  {
    name: "OCCS Flat Pattern Cyan 0.4mm",
    stroke: {
      color: "#0891B2",
      weight: 0.4,
      pattern: "SOLID"
    }
  },
  {
    name: "OCCS Cut Red 0.6mm",
    stroke: {
      color: "#DC2626",
      weight: 0.6,
      pattern: "SOLID"
    }
  },
  {
    name: "OCCS Cut Orange 0.45mm",
    stroke: {
      color: "#F97316",
      weight: 0.45,
      pattern: "SOLID"
    }
  },
  {
    name: "OCCS Fold Amber Dashed 0.35mm",
    stroke: {
      color: "#D97706",
      weight: 0.35,
      pattern: "DASHED"
    }
  },
  {
    name: "OCCS Engrave Indigo Dotted 0.25mm",
    stroke: {
      color: "#4F46E5",
      weight: 0.25,
      pattern: "DOTTED"
    }
  },
  {
    name: "OCCS Code Green 0.35mm",
    stroke: {
      color: "#16A34A",
      weight: 0.35,
      pattern: "SOLID"
    }
  },
  {
    name: "OCCS Dimension Violet Dotted 0.25mm",
    stroke: {
      color: "#7C3AED",
      weight: 0.25,
      pattern: "DOTTED"
    }
  },
  {
    name: "OCCS Envelope Slate Dashed 0.25mm",
    stroke: {
      color: "#64748B",
      weight: 0.25,
      pattern: "DASHED"
    }
  },
  {
    name: "Black Solid 0.35mm",
    stroke: {
      color: "#111827",
      weight: 0.35,
      pattern: "SOLID"
    }
  },
  {
    name: "Red Solid 0.5mm",
    stroke: {
      color: "#DC2626",
      weight: 0.5,
      pattern: "SOLID"
    }
  },
  {
    name: "Blue Dashed 0.25mm",
    stroke: {
      color: "#2563EB",
      weight: 0.25,
      pattern: "DASHED"
    }
  },
  {
    name: "Green Solid 0.7mm",
    stroke: {
      color: "#16A34A",
      weight: 0.7,
      pattern: "SOLID"
    }
  },
  {
    name: "Gray Dotted 0.25mm",
    stroke: {
      color: "#64748B",
      weight: 0.25,
      pattern: "DOTTED"
    }
  }
];

async function upsertSystemPen(db, penData) {
  const existing = await db.collection('pen_templates').findOne({
    'identity.name': penData.name,
    'lineage.userId': null
  });
  if (!existing) {
    await service.create(penData, null);
    return 'created';
  }

  await db.collection('pen_templates').updateOne(
    { _id: existing._id },
    {
      $set: {
        'data.stroke': penData.stroke,
        'status.timestamp': new Date()
      }
    }
  );
  return 'updated';
}

async function main() {
  console.log('🖊️  Seeding system pens...\n');
  
  try {
    const db = await connectDB();
    
    let created = 0;
    let updated = 0;
    for (const penData of SYSTEM_PENS) {
      try {
        const result = await upsertSystemPen(db, penData);
        if (result === 'created') created++;
        if (result === 'updated') updated++;
        console.log(`  ✅ ${penData.name} (${result})`);
      } catch (error) {
        console.log(`  ⚠️  ${penData.name}: ${error.message}`);
      }
    }
    
    console.log(`\n✨ Seeded ${SYSTEM_PENS.length} system pens (${created} created, ${updated} updated)`);
    
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    process.exit(1);
  }
  
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
