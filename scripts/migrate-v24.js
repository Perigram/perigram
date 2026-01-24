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
        $unset: { slug: "", name: "", status: "", contractorId: "", ownerId: "", statistics: "", batchIds: "", queueIds: "", tep: "" }
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
        $unset: { projectSlug: "", name: "", queueNumber: "", status: "", entries: "", additionalFiles: "", previousRemainder: "", runs: "", chosenRunId: "" }
      });
    }

    // 3. Migrate Material Batches to Piles (Flattening)
    console.log('Migrating Material Batches to Piles...');
    const batches = await db.collection('material_batches').find().toArray();
    for (const b of batches) {
      for (const p of (b.piles || [])) {
        const origin = { state: 'STOCKED', userId: b.createdBy || 'SYSTEM', timestamp: b.createdAt || new Date() };
        const pileData = {
          identity: { name: `Pile from ${b.batchNumber}`, serial: p.partyId || '' },
          origin,
          status: origin,
          lineage: { 
            organizationId: b.organizationId,
            warehouseId: b.warehouseId,
            catalogId: null, // manual link needed or heuristic
            colorId: null    // heuristic needed based on color string
          },
          specs: { 
            sheetThickness: p.thickness, 
            foilThickness: p.foilThickness, 
            width: p.width, 
            height: p.height,
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
