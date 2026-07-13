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
  // Layer Standards Collection
  layer_standards: [
    { keys: { 'data.code': 1 }, options: { unique: true, name: 'code_unique' } },
    { keys: { 'lineage.organizationId': 1 }, options: { name: 'lineage_org_idx' } }
  ],

  // Pen Templates Collection
  pen_templates: [
    { keys: { 'lineage.organizationId': 1 }, options: { name: 'lineage_org_idx' } },
    { keys: { 'identity.name': 1 }, options: { name: 'name_idx' } }
  ],

  // Tool Profiles Collection
  tool_profiles: [
    { keys: { 'lineage.organizationId': 1 }, options: { name: 'lineage_org_idx' } }
  ],

  // CNC Machines Collection
  machines: [
    { keys: { 'lineage.organizationId': 1 }, options: { name: 'lineage_org_idx' } },
    { keys: { 'lineage.scope': 1, 'data.default': 1 }, options: { name: 'scope_default_idx' } }
  ],

  // Cassettes Collection
  cassettes: [
    { keys: { 'identity.slug': 1 }, options: { unique: true, name: 'slug_unique' } },
    { keys: { 'lineage.organizationId': 1 }, options: { name: 'lineage_org_idx' } },
    { keys: { 'lineage.libraryId': 1 }, options: { name: 'lineage_library_idx' } }
  ],

  // Libraries Collection
  libraries: [
    { keys: { 'lineage.organizationId': 1 }, options: { name: 'lineage_org_idx' } },
    { keys: { 'status.state.primary': 1 }, options: { name: 'status_state_idx' } }
  ],

  // Projects Collection
  projects: [
    { keys: { 'identity.slug': 1 }, options: { unique: true, name: 'slug_unique' } },
    { keys: { 'lineage.organizationId': 1 }, options: { name: 'lineage_org_idx' } },
    { keys: { 'status.state.primary': 1 }, options: { name: 'status_state_idx' } }
  ],

  // Queues Collection
  queues: [
    { keys: { 'lineage.organizationId': 1, 'lineage.projectId': 1 }, options: { name: 'lineage_org_prj_idx' } },
    { keys: { 'identity.queueNumber': -1 }, options: { name: 'queue_number_idx' } },
    { keys: { 'status.state.primary': 1 }, options: { name: 'status_state_idx' } }
  ],

  // Nesting Runs Collection
  nesting_runs: [
    { keys: { 'lineage.queueId': 1 }, options: { name: 'lineage_queue_idx' } },
    { keys: { 'status.state.primary': 1 }, options: { name: 'status_state_idx' } }
  ],

  // Sheet Designs Collection
  sheet_designs: [
    { keys: { 'lineage.runId': 1 }, options: { name: 'lineage_run_idx' } }
  ],

  // Planned Sheet Instances Collection
  sheet_instances: [
    { keys: { 'lineage.sheetDesignId': 1 }, options: { name: 'lineage_sheet_design_idx' } },
    { keys: { 'lineage.runId': 1 }, options: { name: 'lineage_run_idx' } },
    { keys: { 'status.state.primary': 1 }, options: { name: 'status_state_idx' } }
  ],

  // Cassette Designs Collection
  cassette_designs: [
    { keys: { 'lineage.queueId': 1 }, options: { name: 'lineage_queue_idx' } },
    { keys: { 'lineage.projectId': 1 }, options: { name: 'lineage_project_idx' } }
  ],

  // Cassette Instances Collection
  cassette_instances: [
    { keys: { 'lineage.projectId': 1 }, options: { name: 'lineage_project_idx' } },
    { keys: { 'lineage.sheetId': 1 }, options: { name: 'lineage_sheet_idx' } },
    { keys: { 'identity.serial': 1 }, options: { name: 'serial_idx' } }
  ],

  // Material Piles Collection
  material_piles: [
    { keys: { 'lineage.organizationId': 1, 'lineage.warehouseId': 1 }, options: { name: 'lineage_org_wh_idx' } },
    { keys: { 'status.state.primary': 1 }, options: { name: 'status_state_idx' } }
  ],

  // Sheets Collection
  sheets: [
    { keys: { 'identity.serial': 1 }, options: { unique: true, name: 'serial_unique' } },
    { keys: { 'lineage.pileId': 1 }, options: { name: 'lineage_pile_idx' } },
    { keys: { 'lineage.runId': 1 }, options: { name: 'lineage_run_idx' } },
    { keys: { 'status.state.primary': 1 }, options: { name: 'status_state_idx' } }
  ],

  // Remnants Collection
  remnants: [
    { keys: { 'identity.serial': 1 }, options: { unique: true, name: 'serial_unique' } },
    { keys: { 'lineage.parentSheetId': 1 }, options: { name: 'lineage_parent_sheet_idx' } }
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
    { keys: { organizationId: 1, entityType: 1, status: 1 }, options: { name: 'org_entity_status_idx' } },
    { keys: { organizationId: 1, entityType: 1 }, options: { name: 'org_entity_idx' } }
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

  // Warehouses Collection
  warehouses: [
    { keys: { 'lineage.organizationId': 1 }, options: { name: 'lineage_org_idx' } }
  ],

  // Catalogs Collection
  catalogs: [
    { keys: { manufacturerId: 1 }, options: { name: 'manufacturer_idx' } }
  ],

  // Colors Collection
  colors: [
    { keys: { 'lineage.catalogId': 1 }, options: { name: 'lineage_catalog_idx' } }
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
