/**
 * Database Indexes - v24 Standardized
 * 
 * Defines all indexes for MongoDB collections including the critical Lineage Trace indexes.
 */

import { connectDB } from './mongo.js';

/**
 * Index definitions for all collections
 */
const INDEXES = {
  facades: [
    { keys: { 'lineage.organizationId': 1, 'lineage.projectId': 1 }, options: { name: 'lineage_org_project_idx' } }
  ],
  facade_patterns: [
    { keys: { 'lineage.organizationId': 1 }, options: { name: 'lineage_org_idx' } },
    { keys: { 'identity.slug': 1 }, options: { unique: true, name: 'slug_unique' } }
  ],

  // Cassettes Collection
  cassettes: [
    { keys: { 'identity.slug': 1 }, options: { unique: true, name: 'slug_unique' } },
    { keys: { 'lineage.organizationId': 1 }, options: { name: 'lineage_org_idx' } },
    { keys: { 'lineage.libraryId': 1 }, options: { name: 'lineage_library_idx' } }
  ],

  // Sheet Designs Collection
  sheet_designs: [
    { keys: { 'lineage.runId': 1 }, options: { name: 'lineage_run_idx' } }
  ],

  // Artifacts Collection
  artifacts: [
    { keys: { 'lineage.projectId': 1 }, options: { name: 'lineage_project_idx' } },
    { keys: { 'lineage.queueId': 1 }, options: { name: 'lineage_queue_idx' } },
    { keys: { 'lineage.runId': 1 }, options: { name: 'lineage_run_idx' } },
    { keys: { 'data.type': 1 }, options: { name: 'data_type_idx' } }
  ],

  // Status Events Collection
  status_events: [
    { keys: { targetId: 1, targetType: 1 }, options: { name: 'target_idx' } },
    { keys: { timestamp: -1 }, options: { name: 'timestamp_idx' } }
  ],

  // Workflow Overrides Collection
  workflow_overrides: [
    { keys: { organizationId: 1, typeId: 1, status: 1 }, options: { name: 'org_entity_status_idx' } },
    { keys: { organizationId: 1, typeId: 1 }, options: { name: 'org_entity_idx' } }
  ],

  // Memberships Collection
  memberships: [
    { keys: { 'lineage.organizationId': 1, 'lineage.userId': 1 }, options: { unique: true, name: 'org_user_unique' } }
  ],

  // Organizations Collection
  organizations: [
    { keys: { type: 1 }, options: { name: 'type_idx' } }
  ],

  // Users Collection
  users: [
    { keys: { 'identity.email': 1 }, options: { unique: true, name: 'email_unique' } }
  ],

  // Idempotency Keys Collection (offline outbox replay dedupe)
  idempotency_keys: [
    { keys: { key: 1 }, options: { unique: true, name: 'key_unique' } },
    { keys: { createdAt: 1 }, options: { expireAfterSeconds: 604800, name: 'created_ttl' } }
  ],

  // Push Subscriptions Collection (web push)
  push_subscriptions: [
    { keys: { userId: 1 }, options: { name: 'user_idx' } },
    { keys: { endpoint: 1 }, options: { unique: true, name: 'endpoint_unique' } }
  ]
};

/**
 * Create all indexes
 */
export async function ensureIndexes() {
  console.log('🔧 Creating database indexes...');
  const db = await connectDB();
  
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const [collectionName, indexes] of Object.entries(INDEXES)) {
    console.log(`\n📁 Collection: ${collectionName}`);
    
    for (const { keys, options } of indexes) {
      try {
        const indexName = options.name || Object.keys(keys).join('_');
        
        // Check if index already exists
        const existingIndexes = await db.collection(collectionName).indexes();
        const exists = existingIndexes.some(idx => idx.name === indexName);
        
        if (exists) {
          console.log(`  ⏭️  ${indexName} (already exists)`);
          skipped++;
        } else {
          await db.collection(collectionName).createIndex(keys, options);
          console.log(`  ✅ ${indexName} (created)`);
          created++;
        }
      } catch (error) {
        console.error(`  ❌ Error creating index:`, error.message);
        errors++;
      }
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`  Created: ${created}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
  
  return { created, skipped, errors };
}

/**
 * Drop all custom indexes
 */
export async function dropIndexes(collectionNames = []) {
  console.log('⚠️  Dropping indexes...');
  const db = await connectDB();
  
  const collections = collectionNames.length > 0 
    ? collectionNames 
    : Object.keys(INDEXES);

  for (const collectionName of collections) {
    try {
      const indexes = await db.collection(collectionName).indexes();
      
      for (const index of indexes) {
        if (index.name !== '_id_') {
          await db.collection(collectionName).dropIndex(index.name);
          console.log(`  🗑️  Dropped ${collectionName}.${index.name}`);
        }
      }
    } catch (error) {
      // console.error(`  ❌ Error dropping indexes for ${collectionName}:`, error.message);
    }
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  if (command === 'create') await ensureIndexes();
  else if (command === 'drop') await dropIndexes(process.argv.slice(3));
  process.exit(0);
}
