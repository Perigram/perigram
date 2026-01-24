import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'material_batches';

export async function create(data) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).insertOne({
    ...data,
    createdAt: new Date()
  });
  return await findById(result.insertedId);
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

export async function findByBatchNumber(batchNumber) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ batchNumber });
}

export async function find(filter = {}, options = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find(filter)
    .sort(options.sort || { createdAt: -1 })
    .limit(options.limit || 100)
    .toArray();
}

export async function updateById(id, updates) {

  const db = await connectDB();

  const result = await db.collection(COLLECTION).updateOne(

    { _id: new ObjectId(id) },

    { $set: { ...updates, updatedAt: new Date() } }

  );

  return result.modifiedCount > 0;

}



export async function incrementPileUsedCount(batchId, pileId, count, session = null) {


  const db = await connectDB();
  const options = session ? { session } : {};
  
  const result = await db.collection(COLLECTION).updateOne(
    {
      _id: new ObjectId(batchId),
      'piles._id': new ObjectId(pileId),
      $expr: { 
        $gte: [
          { $subtract: ['$$pile.totalCount', '$$pile.usedCount'] },
          count
        ]
      }
    },
    { 
      $inc: { 'piles.$.usedCount': count },
      $set: { updatedAt: new Date() }
    },
    options
  );
  
  return result.modifiedCount > 0;
}

export async function deleteById(id) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

export async function getNextBatchNumber() {
  const db = await connectDB();
  const lastBatch = await db.collection(COLLECTION)
    .find({})
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();
  
  if (lastBatch.length === 0) {
    return 'BATCH-000001';
  }
  
  const lastNumber = lastBatch[0].batchNumber;
  const match = lastNumber.match(/BATCH-(\d+)/);
  if (match) {
    const nextNum = parseInt(match[1]) + 1;
    return `BATCH-${nextNum.toString().padStart(6, '0')}`;
  }
  
  return `BATCH-${Date.now()}`;
}
