import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'remnants';

export async function create(data) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).insertOne({
    ...data,
    createdAt: new Date()
  });
  return await findById(result.insertedId);
}

export async function createMany(remnants, session = null) {
  const db = await connectDB();
  const options = session ? { session } : {};
  const result = await db.collection(COLLECTION).insertMany(remnants, options);
  return result.insertedCount;
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

export async function findByRemnantNumber(remnantNumber) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ remnantNumber });
}

export async function find(filter = {}, options = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find(filter)
    .sort(options.sort || { createdAt: -1 })
    .limit(options.limit || 100)
    .toArray();
}

export async function findReusable(filter = {}, options = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find({ 
      ...filter, 
      status: 'in_stock',
      isReusable: true 
    })
    .sort(options.sort || { area: -1 })
    .limit(options.limit || 100)
    .toArray();
}

export async function updateById(id, updates) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { $set: updates }
  );
  return result.modifiedCount > 0;
}

export async function deleteById(id) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

export async function getNextRemnantNumber() {
  const db = await connectDB();
  const lastRemnant = await db.collection(COLLECTION)
    .find({})
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();
  
  if (lastRemnant.length === 0) {
    return 'REM-000001';
  }
  
  const lastNumber = lastRemnant[0].remnantNumber;
  const match = lastNumber.match(/REM-(\d+)/);
  if (match) {
    const nextNum = parseInt(match[1]) + 1;
    return `REM-${nextNum.toString().padStart(6, '0')}`;
  }
  
  return `REM-${Date.now()}`;
}
