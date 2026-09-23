
import dotenv from 'dotenv';
dotenv.config();
import { MongoClient } from 'mongodb';

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/perigram_dev';
  console.log('Connecting to:', uri);
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    console.log('Connected to database:', db.databaseName);
    
    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name).join(', '));
    
    if (collections.some(c => c.name === 'nesting_jobs')) {
      const pendingJobs = await db.collection('nesting_jobs').find({ status: 'pending' }).count();
      const processingJobs = await db.collection('nesting_jobs').find({ status: 'processing' }).count();
      const failedJobs = await db.collection('nesting_jobs').find({ status: 'error' }).count();
      const doneJobs = await db.collection('nesting_jobs').find({ status: 'done' }).count();
      
      console.log('Nesting Jobs Status:');
      console.log('  Pending:', pendingJobs);
      console.log('  Processing:', processingJobs);
      console.log('  Error/Failed:', failedJobs);
      console.log('  Done:', doneJobs);
      
      if (processingJobs > 0) {
        const stuckJobs = await db.collection('nesting_jobs').find({ status: 'processing' }).toArray();
        console.log('Stuck Jobs (Processing):');
        stuckJobs.forEach(j => {
          console.log(`  - Slug: ${j.slug}, Created: ${j.createdAt}, Updated: ${j.update_ts}`);
        });
      }
    } else {
      console.log('Collection nesting_jobs NOT FOUND in this database.');
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

main();
