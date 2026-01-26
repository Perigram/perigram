import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cutkit_dev';
const client = new MongoClient(MONGO_URI);

async function check() {
  try {
    await client.connect();
    const db = client.db();
    
    console.log('--- CATALOGS ---');
    const catalog = await db.collection('catalogs').findOne();
    console.log(JSON.stringify(catalog, null, 2));

    console.log('\n--- COLORS ---');
    const color = await db.collection('colors').findOne();
    console.log(JSON.stringify(color, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

check();
