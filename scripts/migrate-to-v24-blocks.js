import { MongoClient, ObjectId } from 'mongodb';
import * as dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cutkit_dev';
const client = new MongoClient(MONGO_URI);

async function migrate() {
  try {
    await client.connect();
    const db = client.db();
    
    const collections = [
        { name: 'users', fields: ['email', 'passwordHash', 'role', 'permissions', 'memberships', 'isActive'] },
        { name: 'projects', fields: ['metadata', 'summary'] },
        { name: 'queues', fields: ['job', 'queueNumber', 'materialPool'] },
        { name: 'material_piles', fields: ['specs', 'stock', 'serial', 'quantity'] },
        { name: 'catalogs', fields: ['material', 'pricing', 'options', 'currency'] }
    ];

    for (const col of collections) {
        console.log(`Migrating ${col.name}...`);
        const docs = await db.collection(col.name).find({ data: { $exists: false } }).toArray();
        console.log(`Found ${docs.length} legacy documents in ${col.name}`);

        for (const doc of docs) {
            const data = {};
            col.fields.forEach(f => {
                if (doc[f] !== undefined) data[f] = doc[f];
            });

            const identity = {
                uid: doc._id.toString(),
                name: doc.name || doc.identity?.name || 'Unnamed'
            };

            const lineage = doc.lineage || {};
            if (doc.organizationId) lineage.organizationId = doc.organizationId;
            if (doc.projectId) lineage.projectId = doc.projectId;
            if (doc.warehouseId) lineage.warehouseId = doc.warehouseId;

            await db.collection(col.name).updateOne(
                { _id: doc._id },
                { 
                    $set: { 
                        data, 
                        identity, 
                        lineage,
                        origin: doc.origin || doc.status || { state: 'ACTIVE', timestamp: doc.createdAt || new Date() },
                        status: doc.status || { state: 'ACTIVE', timestamp: new Date() }
                    }
                }
            );
        }
    }

    console.log('Migration complete.');
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

migrate();
