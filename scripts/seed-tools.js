/**
 * Seed Default Tool Profiles
 */

import { MongoClient, ObjectId } from 'mongodb';
import * as dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cutkit_dev';
const client = new MongoClient(MONGO_URI);

const tools = [
  {
    _id: new ObjectId(),
    name: 'Standard CNC Router (3.175mm)',
    description: 'Generic CNC router with 1/8 inch endmill',
    diameter: 3.175,
    kerf: 3.2,
    lineage: {}
  },
  {
    _id: new ObjectId(),
    name: 'Precision Router (2.0mm)',
    description: 'Fine cutting tool',
    diameter: 2.0,
    kerf: 2.1,
    lineage: {}
  }
];

async function seed() {
  try {
    await client.connect();
    const db = client.db();
    console.log('Connected to database for seeding tools...');

    for (const tool of tools) {
      await db.collection('tool_profiles').updateOne(
        { name: tool.name },
        { $set: tool },
        { upsert: true }
      );
      console.log(`Upserted tool: ${tool.name}`);
    }

    console.log('Tool seeding completed successfully.');
  } catch (err) {
    console.error('Seeding failed:', err);
  } finally {
    await client.close();
  }
}

seed();
