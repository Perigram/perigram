// Quick script to check baked cassettes in MongoDB
// Run with: node check-baked-cassettes.js

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/cutkit';
const client = new MongoClient(uri);

async function main() {
  await client.connect();
  const db = client.db();
  
  console.log('Checking cassettes collection...');
  const cassettesCount = await db.collection('cassettes').countDocuments();
  console.log(`Total cassettes: ${cassettesCount}`);
  
  console.log('\nChecking baked_cassettes collection...');
  const bakedCount = await db.collection('baked_cassettes').countDocuments();
  console.log(`Total baked cassettes: ${bakedCount}`);
  
  if (bakedCount > 0) {
    console.log('\nRecent baked cassettes:');
    const recent = await db.collection('baked_cassettes')
      .find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();
    
    recent.forEach(c => {
      console.log(`  ID: ${c._id}, Created: ${c.createdAt}, Name: ${c.name}`);
    });
  }
  
  console.log('\nLooking for specific cassette: 696c96ab75517cc77d3a63e4');
  const { ObjectId } = await import('mongodb');
  const specific = await db.collection('baked_cassettes').findOne({ 
    _id: new ObjectId('696c96ab75517cc77d3a63e4') 
  });
  
  if (specific) {
    console.log('Found in baked_cassettes!');
    console.log(JSON.stringify(specific, null, 2));
  } else {
    const inCassettes = await db.collection('cassettes').findOne({ 
      _id: new ObjectId('696c96ab75517cc77d3a63e4') 
    });
    if (inCassettes) {
      console.log('Found in cassettes collection!');
      console.log(JSON.stringify(inCassettes, null, 2));
    } else {
      console.log('NOT FOUND in either collection!');
    }
  }
  
  await client.close();
}

main().catch(console.error);
