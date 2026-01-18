
import dotenv from 'dotenv';
dotenv.config();
import { MongoClient } from 'mongodb';

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/cutkit_dev';
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    
    const standards = await db.collection('layer_standards').find().toArray();
    console.log('Layer Standards:', JSON.stringify(standards, null, 2));
    
    const pens = await db.collection('pen_templates').find().toArray();
    console.log('Pen Templates:', JSON.stringify(pens, null, 2));
    
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

main();
