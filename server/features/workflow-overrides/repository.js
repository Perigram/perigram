import { ObjectId } from 'mongodb';
import { connectDB } from '~/server/db/mongo.js';
import { toFlexibleId } from '~/server/utils/objectid.js';

const COLLECTION = 'workflow_overrides';

export async function findActiveByEntity({ organizationId, typeId }) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({
    organizationId: toFlexibleId(organizationId),
    typeId,
    status: 'ACTIVE'
  });
}

export async function findLatestByEntity({ organizationId, typeId }) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find({ organizationId: toFlexibleId(organizationId), typeId })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(1)
    .next();
}

export async function create(data) {
  const db = await connectDB();
  const now = new Date();
  const doc = {
    _id: data._id || new ObjectId(),
    ...data,
    organizationId: toFlexibleId(data.organizationId),
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now
  };
  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

export async function archiveActive({ organizationId, typeId, updatedBy }) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).updateMany(
    {
      organizationId: toFlexibleId(organizationId),
      typeId,
      status: 'ACTIVE'
    },
    {
      $set: {
        status: 'ARCHIVED',
        updatedBy,
        updatedAt: new Date()
      }
    }
  );
  return result.modifiedCount;
}
