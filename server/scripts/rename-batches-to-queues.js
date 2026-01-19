import { connectDB } from '../db/mongo.js';

async function renameBatchesToQueues() {
  const db = await connectDB();
  
  try {
    await db.collection('batches').rename('queues');
    console.log('✓ Renamed batches → queues');
  } catch (err) {
    if (err.codeName === 'NamespaceNotFound') {
      console.log('⚠ batches collection does not exist (probably already renamed)');
    } else {
      throw err;
    }
  }
  
  process.exit(0);
}

renameBatchesToQueues();