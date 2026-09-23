#!/usr/bin/env node
/**
 * Migration: Convert to embedded statusHistory
 * Moves existing status/timestamp/userId fields to statusHistory array
 */

const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DB || 'perigram';

// Collections to migrate
const COLLECTIONS = [
  'queues',
  'projects', 
  'sheets',
  'requisitions',
  'material_batches',
  'cassette_instances',
  'invitations'
];

async function migrate() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db(DB_NAME);
    
    for (const collection of COLLECTIONS) {
      console.log(`\n📦 Migrating ${collection}...`);
      
      const coll = db.collection(collection);
      const docs = await coll.find({}).toArray();
      
      console.log(`   Found ${docs.length} documents`);
      
      let migrated = 0;
      
      for (const doc of docs) {
        const updates = {};
        const unset = {};
        
        // Build statusHistory from existing fields
        const statusHistory = doc.statusHistory || [];
        
        // Add creation entry if createdAt exists
        if (doc.createdAt && statusHistory.length === 0) {
          statusHistory.push({
            status: doc.status || 'draft',
            timestamp: doc.createdAt,
            userId: doc.userId || doc.ownerId || 'system',
            note: 'Created',
            metadata: { migrated: true }
          });
        }
        
        // Add update entry if different from creation
        if (doc.updatedAt && doc.updatedAt.getTime() !== doc.createdAt?.getTime()) {
          statusHistory.push({
            status: doc.status || 'draft',
            timestamp: doc.updatedAt,
            userId: doc.userId || doc.ownerId || 'system',
            note: 'Updated',
            metadata: { migrated: true }
          });
        }
        
        if (statusHistory.length > 0) {
          updates.statusHistory = statusHistory;
          updates.status = statusHistory[statusHistory.length - 1].status; // current status
        }
        
        // Mark deprecated fields for removal (but don't remove yet - safety first)
        // unset.createdAt = "";
        // unset.updatedAt = "";
        // unset.timestamp = "";
        
        if (Object.keys(updates).length > 0) {
          await coll.updateOne(
            { _id: doc._id },
            { $set: updates }
          );
          migrated++;
        }
      }
      
      console.log(`   ✓ Migrated ${migrated} documents`);
    }
    
    console.log('\n✅ Migration complete!');
    console.log('\n⚠️  NOTE: Old fields (createdAt, updatedAt) NOT removed for safety.');
    console.log('   After verifying, run cleanup script to remove them.');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

migrate();
