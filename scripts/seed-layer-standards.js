/**
 * Seed Layer Standards
 * Sets up basic layer standards for v24
 */

import { MongoClient, ObjectId } from 'mongodb';
import * as dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cutkit_dev';
const client = new MongoClient(MONGO_URI);

const standards = [
  {
    code: '1_1_FACE',
    category: 'FACE',
    identity: { name: 'Face', slug: 'face', serial: '', reference: '' },
    i18n: { 
      en: { nameTemplate: 'Face' }, 
      ru: { nameTemplate: 'Лицевая сторона' } 
    },
    parameters: [],
    lineage: {}
  },
  {
    code: '1_3_UNFOLD_BOUNDARY',
    category: 'CONTOUR',
    identity: { name: 'Unfold Boundary', slug: 'unfold-boundary', serial: '', reference: '' },
    i18n: { 
      en: { nameTemplate: 'Unfold Boundary' }, 
      ru: { nameTemplate: 'Развертка' } 
    },
    parameters: [],
    lineage: {}
  },
  {
    code: '2_2_HOLE',
    category: 'HOLE',
    identity: { name: 'Hole', slug: 'hole', serial: '', reference: '' },
    i18n: { 
      en: { nameTemplate: 'Hole' }, 
      ru: { nameTemplate: 'Отверстие' } 
    },
    parameters: [],
    lineage: {}
  }
];

async function seed() {
  try {
    await client.connect();
    const db = client.db();
    console.log('Connected to database for seeding...');

    for (const s of standards) {
      await db.collection('layer_standards').updateOne(
        { code: s.code },
        { $set: s },
        { upsert: true }
      );
      console.log(`Upserted layer standard: ${s.code}`);
    }

    console.log('Seeding completed successfully.');
  } catch (err) {
    console.error('Seeding failed:', err);
  } finally {
    await client.close();
  }
}

seed();
