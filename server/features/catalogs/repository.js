import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'catalogs';

export async function create(data) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).insertOne({
    ...data,
    sheetTypes: data.sheetTypes || [],
    createdAt: new Date(),
    updatedAt: new Date()
  });
  return await findById(result.insertedId);
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
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

export async function addSheetType(catalogId, sheetType) {
  const db = await connectDB();
  const sheetTypeWithId = {
    ...sheetType,
    _id: new ObjectId()
  };
  const result = await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(catalogId) },
    { 
      $push: { sheetTypes: sheetTypeWithId },
      $set: { updatedAt: new Date() }
    }
  );
  return result.modifiedCount > 0 ? sheetTypeWithId : null;
}

export async function updateSheetType(catalogId, sheetTypeId, updates) {
  const db = await connectDB();
  const updateFields = {};
  for (const [key, value] of Object.entries(updates)) {
    updateFields[`sheetTypes.$.${key}`] = value;
  }
  
  const result = await db.collection(COLLECTION).updateOne(
    { 
      _id: new ObjectId(catalogId),
      'sheetTypes._id': new ObjectId(sheetTypeId)
    },
    { 
      $set: { ...updateFields, updatedAt: new Date() }
    }
  );
  return result.modifiedCount > 0;
}

export async function removeSheetType(catalogId, sheetTypeId) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(catalogId) },
    { 
      $pull: { sheetTypes: { _id: new ObjectId(sheetTypeId) } },
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
