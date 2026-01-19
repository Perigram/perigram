import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'sheets';

export async function create(data) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).insertOne({
    ...data,
    createdAt: new Date()
  });
  return await findById(result.insertedId);
}

export async function createMany(sheets, session = null) {
  const db = await connectDB();
  const options = session ? { session } : {};
  const result = await db.collection(COLLECTION).insertMany(sheets, options);
  return result.insertedCount;
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

export async function findBySheetNumber(sheetNumber) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ sheetNumber });
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
    { $set: updates }
  );
  return result.modifiedCount > 0;
}

export async function addHistory(id, historyEntry) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { 
      $push: { history: historyEntry },
      $set: { updatedAt: new Date() }
    }
  );
  return result.modifiedCount > 0;
}

export async function deleteById(id) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

export async function getNextSheetNumber() {
  const db = await connectDB();
  const lastSheet = await db.collection(COLLECTION)
    .find({})
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();
  
  if (lastSheet.length === 0) {
    return 'SH-000001';
  }
  
  const lastNumber = lastSheet[0].sheetNumber;
  const match = lastNumber.match(/SH-(\d+)/);
  if (match) {
    const nextNum = parseInt(match[1]) + 1;
    return `SH-${nextNum.toString().padStart(6, '0')}`;
  }
  
  return `SH-${Date.now()}`;
}
