/**
 * Database Indexes
 * 
 * Defines all indexes for MongoDB collections.
 * Run this script to ensure indexes are created.
 * 
 * Usage:
 *   node server/db/indexes.js
 * 
 * Or call ensureIndexes() during app startup.
 */

import { connectDB } from './mongo.js';

/**
 * Index definitions for all collections
 */
const INDEXES = {
  // Layer Standards Collection
  layer_standards: [
    { keys: { code: 1 }, options: { unique: true, name: 'code_unique' } },
    { keys: { category: 1 }, options: { name: 'category_idx' } },
    { keys: { isActive: 1 }, options: { name: 'isActive_idx' } }
  ],

  // Pen Templates Collection
  pen_templates: [
    { keys: { ownerId: 1 }, options: { name: 'ownerId_idx' } },
    { keys: { name: 1 }, options: { name: 'name_idx' } }
  ],

  // Tool Profiles Collection
  tool_profiles: [
    { keys: { ownerId: 1 }, options: { name: 'ownerId_idx' } },
    { keys: { diameter: 1 }, options: { name: 'diameter_idx' } }
  ],

  // Cassette Templates Collection
  cassette_templates: [
    { keys: { slug: 1 }, options: { unique: true, name: 'slug_unique' } },
    { keys: { ownerId: 1 }, options: { name: 'ownerId_idx' } },
    { keys: { status: 1 }, options: { name: 'status_idx' } },
    { keys: { dxfId: 1 }, options: { name: 'dxfId_idx' } }
  ],

  // Batches Collection
  batches: [
    { keys: { projectSlug: 1, batchNumber: 1 }, options: { unique: true, name: 'project_batch_unique' } },
    { keys: { ownerId: 1 }, options: { name: 'ownerId_idx' } },
    { keys: { status: 1 }, options: { name: 'status_idx' } }
  ],

  // Artifacts Collection
  artifacts: [
    { keys: { batchId: 1 }, options: { name: 'batchId_idx' } },
    { keys: { type: 1 }, options: { name: 'type_idx' } },
    { keys: { status: 1 }, options: { name: 'status_idx' } },
    { keys: { createdAt: -1 }, options: { name: 'createdAt_idx' } }
  ],

  // Organizations Collection
  organizations: [
    { keys: { type: 1 }, options: { name: 'type_idx' } },
    { keys: { createdAt: -1 }, options: { name: 'createdAt_idx' } }
  ],

  // Users Collection
  users: [
    { keys: { email: 1 }, options: { unique: true, name: 'email_unique' } },
    { keys: { organizationId: 1 }, options: { name: 'organizationId_idx' } },
    { keys: { 'sessions.sessionId': 1 }, options: { name: 'sessions_sessionId_idx' } }
  ],

  // Sessions Collection (New scalable session storage)
  sessions: [
    { keys: { sessionId: 1 }, options: { unique: true, name: 'sessionId_unique' } },
    { keys: { userId: 1 }, options: { name: 'userId_idx' } },
    { keys: { expiresAt: 1 }, options: { expireAfterSeconds: 0, name: 'expiresAt_ttl' } } // TTL index for auto-cleanup
  ],

  // Projects Collection (existing, extended)
  projects: [
    { keys: { slug: 1 }, options: { unique: true, name: 'slug_unique' } },
    { keys: { ownerId: 1 }, options: { name: 'ownerId_idx' } },
    { keys: { status: 1 }, options: { name: 'status_idx' } }
  ],

  // Warehouses Collection
  warehouses: [
    { keys: { organizationId: 1 }, options: { name: 'organizationId_idx' } }
  ],

  // Catalogs Collection
  catalogs: [
    { keys: { manufacturerId: 1 }, options: { name: 'manufacturerId_idx' } },
    { keys: { 'sheetTypes._id': 1 }, options: { name: 'sheetTypes_id_idx' } }
  ],

  // Requisitions Collection
  requisitions: [
    { keys: { requisitionNumber: 1 }, options: { unique: true, name: 'reqNumber_unique' } },
    { keys: { contractorId: 1, status: 1 }, options: { name: 'contractor_status_idx' } },
    { keys: { manufacturerId: 1, status: 1 }, options: { name: 'mfg_status_idx' } }
  ],

  // Material Batches Collection
  material_batches: [
    { keys: { batchNumber: 1 }, options: { unique: true, name: 'batchNumber_unique' } },
    { keys: { warehouseId: 1, status: 1 }, options: { name: 'warehouse_status_idx' } },
    { keys: { requisitionId: 1 }, options: { name: 'requisitionId_idx' } },
    { keys: { 'piles._id': 1 }, options: { name: 'piles_id_idx' } }
  ],

  // Sheets Collection
  sheets: [
    { keys: { sheetNumber: 1 }, options: { unique: true, name: 'sheetNumber_unique' } },
    { keys: { batchId: 1, pileId: 1 }, options: { name: 'batch_pile_idx' } },
    { keys: { warehouseId: 1, status: 1 }, options: { name: 'warehouse_status_idx' } },
    { keys: { queueId: 1 }, options: { name: 'queueId_idx' } }
  ],

  // Remnants Collection
  remnants: [
    { keys: { remnantNumber: 1 }, options: { unique: true, name: 'remnantNumber_unique' } },
    { keys: { sheetId: 1 }, options: { name: 'sheetId_idx' } },
    { keys: { warehouseId: 1, status: 1, isReusable: 1 }, options: { name: 'warehouse_status_reusable_idx' } }
  ],

  // Transactions Collection
  transactions: [
    { keys: { status: 1, createdAt: -1 }, options: { name: 'status_createdAt_idx' } },
    { keys: { userId: 1 }, options: { name: 'userId_idx' } },
    { keys: { checkoutId: 1 }, options: { unique: true, name: 'checkoutId_unique' } }
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
 * Drop all custom indexes (useful for reset)
 * WARNING: This will drop indexes but not the _id index
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
        // Don't drop the _id index
        if (index.name !== '_id_') {
          await db.collection(collectionName).dropIndex(index.name);
          console.log(`  🗑️  Dropped ${collectionName}.${index.name}`);
        }
      }
    } catch (error) {
      console.error(`  ❌ Error dropping indexes for ${collectionName}:`, error.message);
    }
  }
}

/**
 * List all indexes for a collection
 */
export async function listIndexes(collectionName) {
  const db = await connectDB();
  const indexes = await db.collection(collectionName).indexes();
  
  console.log(`\n📁 Indexes for ${collectionName}:`);
  for (const index of indexes) {
    console.log(`  - ${index.name}:`, index.key);
  }
  
  return indexes;
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  
  switch (command) {
    case 'create':
      await ensureIndexes();
      break;
    case 'drop':
      const collections = process.argv.slice(3);
      await dropIndexes(collections);
      break;
    case 'list':
      const collection = process.argv[3];
      if (!collection) {
        console.error('Usage: node indexes.js list <collection_name>');
        process.exit(1);
      }
      await listIndexes(collection);
      break;
    default:
      console.log(`
Database Index Manager

Usage:
  node server/db/indexes.js create              Create all indexes
  node server/db/indexes.js drop [collections]  Drop indexes (optional: specific collections)
  node server/db/indexes.js list <collection>   List indexes for collection

Examples:
  node server/db/indexes.js create
  node server/db/indexes.js drop batches artifacts
  node server/db/indexes.js list batches
      `);
  }
  
  process.exit(0);
}
