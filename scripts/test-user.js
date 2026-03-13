import { MongoClient } from 'mongodb';

async function test() {
  const uri = process.env.NUXT_MONGODB_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017';
  try {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 2000 });
    await client.connect();
    const db = client.db();
    const user = await db.collection('users').findOne({});
    console.log('Sample user:', JSON.stringify(user, null, 2));
    await client.close();
  } catch (e) {
    console.error('Connection failed:', e.message);
  }
}

test();
