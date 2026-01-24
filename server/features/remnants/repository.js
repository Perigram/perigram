import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'remnants';

export async function create(data) {
  const db = await connectDB();
  const doc = {
    remnantNumber: data.remnantNumber,
    sheetId: data.sheetId ? new ObjectId(data.sheetId) : null,
    warehouseId: data.warehouseId ? new ObjectId(data.warehouseId) : null,
    organizationId: data.organizationId ? new ObjectId(data.organizationId) : null,
    material: data.material,
    color: data.color,
    thickness: data.thickness,
    foilThickness: data.foilThickness,
    geometryDxf: data.geometryDxf,
    area: data.area,
    width: data.width,
    height: data.height,
    qrCode: data.qrCode,
    isReusable: data.isReusable,
    usedInQueueId: data.usedInQueueId ? new ObjectId(data.usedInQueueId) : null
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
  const { _id, createdAt, updatedAt, status, createdBy, userId, ...clean } = updates;
  return await db.collection(COLLECTION).updateOne({ _id: new ObjectId(id) }, { $set: clean });
}

export async function deleteById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
}