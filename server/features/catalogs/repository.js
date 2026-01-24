import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'catalogs';

export async function create(data) {
  const db = await connectDB();
  const doc = {
    name: data.name,
    manufacturerId: data.manufacturerId ? new ObjectId(data.manufacturerId) : null,
    description: data.description || '',
    material: data.material,
    foilThicknessOptions: data.foilThicknessOptions || [],
    sheetThicknessOptions: data.sheetThicknessOptions || [],
    widthOptions: data.widthOptions || []
  };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

export async function find(filter = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).find(filter).toArray();
}

export async function updateById(id, updates) {
  const db = await connectDB();
  const { _id, createdAt, updatedAt, userId, organizationId, organizationData, role, ...clean } = updates;
  return await db.collection(COLLECTION).updateOne({ _id: new ObjectId(id) }, { $set: clean });
}

export async function deleteById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
}
