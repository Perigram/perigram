/**
 * v24 Migration Script
 * Transforms legacy data structures into the new standardized block architecture.
 */

import { MongoClient, ObjectId } from 'mongodb';
import * as dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cutkit_dev';
const client = new MongoClient(MONGO_URI);

async function migrate() {
  try {
    await client.connect();
    const db = client.db();
    console.log('Connected to database for migration...');

    // 1. Migrate Projects
    console.log('Migrating Projects...');
    const projects = await db.collection('projects').find({ identity: { $exists: false } }).toArray();
    for (const p of projects) {
      const origin = { 
        state: 'DRAFT', 
        userId: p.ownerId?.toString() || 'SYSTEM', 
        timestamp: p.createdAt || new Date(),
        metadata: { note: 'Migrated from v23' }
      };
      await db.collection('projects').updateOne({ _id: p._id }, {
        $set: {
          identity: { slug: p.slug, name: p.name || 'Unnamed Project' },
          origin,
          status: { ...origin, state: p.status || 'ACTIVE' },
          lineage: { organizationId: p.contractorId },
          summary: { 
            totalArea: p.statistics?.totalArea || 0,
            progress: 0,
            queueCount: p.queueIds?.length || 0
          }
        },
        $unset: { contractorId: "", ownerId: "", statistics: "", batchIds: "", queueIds: "", tep: "" }
      });
    }

    // 2. Migrate Queues
    console.log('Migrating Queues...');
    const queues = await db.collection('queues').find({ identity: { $exists: false } }).toArray();
    for (const q of queues) {
      const project = await db.collection('projects').findOne({ slug: q.projectSlug });
      const origin = { 
        state: 'PENDING', 
        userId: 'SYSTEM', 
        timestamp: q.createdAt || new Date(),
        metadata: { note: 'Migrated from v23' }
      };
      await db.collection('queues').updateOne({ _id: q._id }, {
        $set: {
          identity: { name: q.name || 'Unnamed Queue', queueNumber: q.queueNumber },
          origin,
          status: { ...origin, state: q.status || 'READY' },
          lineage: { 
            organizationId: project?.lineage?.organizationId,
            projectId: project?._id
          },
          job: {
            items: (q.entries || []).map(e => ({
              type: 'PARAMETRIC',
              id: e.cassetteTemplateId,
              quantity: e.quantity,
              parameters: e.dimensions || {}
            })),
            materialPool: q.previousRemainder ? [{ type: 'REMNANT', id: q.previousRemainder }] : []
          }
        },
        $unset: { projectSlug: "", entries: "", additionalFiles: "", previousRemainder: "", runs: "", chosenRunId: "" }
      });
    }

    // 3. Migrate Catalogs
    console.log('Migrating Catalogs...');
    const catalogs = await db.collection('catalogs').find({ identity: { $exists: false } }).toArray();
    for (const c of catalogs) {
      const origin = { state: 'ACTIVE', userId: 'SYSTEM', timestamp: c.createdAt || new Date() };
      await db.collection('catalogs').updateOne({ _id: c._id }, {
        $set: {
          identity: { name: c.name || 'Unnamed Catalog' },
          origin,
          status: origin,
          lineage: { organizationId: c.manufacturerId ? new ObjectId(c.manufacturerId) : null },
          // Keep material and options if they exist
          material: c.material || 'ALUMINUM',
          pricing: c.pricing || { pricePerSqm: 25, currency: 'USD' },
          options: c.options || {
            sheetThicknesses: c.sheetThicknessOptions || [4],
            foilThicknesses: c.foilThicknessOptions || [0.3],
            widths: c.widthOptions || [1220],
            lengths: c.lengthOptions || [3000]
          }
        },
        $unset: { manufacturerId: "", sheetTypes: "", sheetThicknessOptions: "", foilThicknessOptions: "", widthOptions: "", lengthOptions: "" }
      });
    }

    // 4. Migrate Colors
    console.log('Migrating Colors...');
    const colors = await db.collection('colors').find({ identity: { $exists: false } }).toArray();
    for (const col of colors) {
      const catalog = await db.collection('catalogs').findOne({ _id: new ObjectId(col.catalogId) });
      await db.collection('colors').updateOne({ _id: col._id }, {
        $set: {
          identity: { 
            name: col.color || col.name || 'Unnamed Color',
            code: col.colorCode || col.code || ''
          },
          visuals: {
            hexCode: col.colorFallback || '#cccccc',
            textureUrl: col.colorThumbnail || null
          },
          lineage: {
            organizationId: catalog?.lineage?.organizationId,
            catalogId: catalog?._id
          }
        },
        $unset: { color: "", colorCode: "", colorFallback: "", colorThumbnail: "", catalogId: "", name: "", code: "" }
      });
    }

    // 5. Migrate Material Batches to Piles (Flattening)
    console.log('Migrating Material Batches to Piles...');
    await db.collection('material_piles').deleteMany({}); // Clear to avoid duplicates during dev
    const batches = await db.collection('material_batches').find().toArray();
    for (const b of batches) {
      for (const p of (b.piles || [])) {
        const origin = { state: 'STOCKED', userId: b.createdBy || 'SYSTEM', timestamp: b.createdAt || new Date() };
        const pileData = {
          identity: { name: `Pile from ${b.batchNumber}`, serial: p.partyId || '' },
          origin,
          status: origin,
          lineage: { 
            organizationId: b.organizationId ? new ObjectId(b.organizationId) : null,
            warehouseId: b.warehouseId ? new ObjectId(b.warehouseId) : null,
            catalogId: null, 
            colorId: null
          },
          specs: { 
            sheetThickness: p.thickness, 
            foilThickness: p.foilThickness, 
            width: p.width, 
            length: p.height, // height in v23 was length
            area: (p.width * p.height) / 1000000 
          },
          stock: { total: p.totalCount, used: p.usedCount }
        };
        await db.collection('material_piles').insertOne(pileData);
      }
    }

    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.close();
  }
}

migrate();
