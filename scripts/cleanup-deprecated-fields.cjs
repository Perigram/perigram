#!/usr/bin/env node
/**
 * Cleanup: Remove deprecated fields after successful migration
 * RUN ONLY AFTER VERIFYING THE MIGRATION WORKED!
 */

const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DB || 'cutkit';

const COLLECTIONS = [
  'queues',
  'projects', 
  'sheets',
  'requisitions',
  'material_batches',
  'cassette_instances',
  'invitations',
  'artifacts',
  'cassettes',
  'catalogs'
];

const FIELDS_TO_REMOVE = [
  'success',     // mysterious field
  'createdAt',   // now in statusHistory
  'updatedAt',   // now in statusHistory
  'timestamp',   // now in statusHistory
  'count'        // from cassette_instances (wrong concept)
];

async function cleanup() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db(DB_NAME);
    
    console.log('⚠️  WARNING: This will permanently delete fields!');
    console.log('   Fields to remove:', FIELDS_TO_REMOVE.join(', '));
    console.log('');
    
    for (const collection of COLLECTIONS) {
      console.log(`📦 Cleaning ${collection}...`);
      
      const coll = db.collection(collection);
      
      const unsetFields = {};
      FIELDS_TO_REMOVE.forEach(field => {
        unsetFields[field] = "";
      });
      
      const result = await coll.updateMany(
        {},
        { $unset: unsetFields }
      );
      
      console.log(`   ✓ Modified ${result.modifiedCount} documents`);
    }
    
    console.log('\n✅ Cleanup complete!');
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

cleanup();
