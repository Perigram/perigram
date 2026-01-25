import { MongoClient } from 'mongodb';

async function test() {
  const uri = process.env.NUXT_MONGODB_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017';
  console.log('Testing connection to:', uri.replace(/:([^:@]+)@/, ':****@'));
  try {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 2000 });
    await client.connect();
    console.log('Connected successfully');
    const db = client.db();
    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));
    await client.close();
  } catch (e) {
    console.error('Connection failed:', e.message);
  }
}

test();