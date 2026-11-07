import { connectDB } from '~/server/db/mongo';
import { toFlexibleId } from '~/server/utils/objectid.js';

const COLLECTION = 'instance_overlays';

export function serialize(row) {
  return {
    _id: row._id.toString(),
    organizationId: String(row.organizationId),
    typeId: row.typeId,
    instanceId: String(row.instanceId),
    blocks: row.blocks || [],
    order: row.order || [],
    updatedBy: row.updatedBy ? String(row.updatedBy) : null,
    updatedAt: row.updatedAt
  };
}

export async function findByKey(organizationId, typeId, instanceId) {
  const db = await connectDB();
  return db.collection(COLLECTION).findOne({
    organizationId: toFlexibleId(organizationId),
    typeId: String(typeId),
    instanceId: toFlexibleId(instanceId)
  });
}

export async function upsert({ organizationId, typeId, instanceId, blocks, order, updatedBy }) {
  const db = await connectDB();
  const filter = {
    organizationId: toFlexibleId(organizationId),
    typeId: String(typeId),
    instanceId: toFlexibleId(instanceId)
  };
  const updated = await db.collection(COLLECTION).findOneAndUpdate(
    filter,
    {
      $set: { blocks, order, updatedBy: updatedBy || null, updatedAt: new Date() },
      $setOnInsert: { ...filter, createdBy: updatedBy || null, createdAt: new Date() }
    },
    { returnDocument: 'after', upsert: true }
  );
  return updated;
}

export async function remove(organizationId, typeId, instanceId) {
  const db = await connectDB();
  await db.collection(COLLECTION).deleteOne({
    organizationId: toFlexibleId(organizationId),
    typeId: String(typeId),
    instanceId: toFlexibleId(instanceId)
  });
}
