import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'sheets';

export async function create(data) {
  const db = await connectDB();
  const doc = {
    sheetNumber: data.sheetNumber,
    batchId: data.batchId ? new ObjectId(data.batchId) : null,
    pileId: data.pileId ? new ObjectId(data.pileId) : null,
    warehouseId: data.warehouseId ? new ObjectId(data.warehouseId) : null,
    organizationId: data.organizationId ? new ObjectId(data.organizationId) : null,
    material: data.material,
    color: data.color,
    thickness: data.thickness,
    foilThickness: data.foilThickness,
    width: data.width,
    height: data.height,
    queueId: data.queueId ? new ObjectId(data.queueId) : null,
    cassetteInstanceIds: data.cassetteInstanceIds || [],
    remnantIds: data.remnantIds || [],
    note: data.note || ''
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
  const { _id, createdAt, updatedAt, status, history, userId, ...clean } = updates;
  return await db.collection(COLLECTION).updateOne({ _id: new ObjectId(id) }, { $set: clean });
}

export async function deleteById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
}