import { ObjectId } from 'mongodb';
import { connectDB } from '~/server/db/mongo.js';
import { toFlexibleId } from '~/server/utils/objectid.js';

const COLLECTION = 'process_definitions';

export async function create(data) {
  const db = await connectDB();
  const doc = {
    ...(data.toJSON ? data.toJSON() : data),
    _id: data._id || new ObjectId()
  };
  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toFlexibleId(id) });
}

export async function find(filter = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).find(filter).sort({ 'identity.name': 1 }).toArray();
}

export async function findActiveByOrganization(organizationId) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({
    'lineage.organizationId': toFlexibleId(organizationId),
    'status.state.primary': 'ACTIVE'
  });
}

export async function updateById(id, updates) {
  const db = await connectDB();
  const clean = updates.toJSON ? updates.toJSON() : { ...updates };
  delete clean._id;
  await db.collection(COLLECTION).updateOne({ _id: toFlexibleId(id) }, { $set: clean });
  return await findById(id);
}

export async function archiveActiveByOrganization(organizationId, userId) {
  const db = await connectDB();
  return await db.collection(COLLECTION).updateMany(
    {
      'lineage.organizationId': toFlexibleId(organizationId),
      'status.state.primary': 'ACTIVE'
    },
    {
      $set: {
        'status.state.primary': 'ARCHIVED',
        'status.state.active.main': 'ARCHIVED',
        'status.state.regions.main.state': 'ARCHIVED',
        'status.state.regions.main.path': ['ARCHIVED'],
        'status.userId': userId || 'SYSTEM',
        'status.timestamp': new Date(),
        'status.metadata': { note: 'Archived by process activation' }
      }
    }
  );
}

export async function findEntityInCollection(collection, id) {
  const db = await connectDB();
  const flexibleId = toFlexibleId(id);
  return await db.collection(collection).findOne({
    $or: [{ _id: flexibleId }, { 'identity.uid': String(id) }]
  });
}

export async function setEntityFieldsInCollection(collection, id, set = {}) {
  const db = await connectDB();
  const result = await db.collection(collection).updateOne(
    { $or: [{ _id: toFlexibleId(id) }, { 'identity.uid': String(id) }] },
    { $set: set }
  );
  return result;
}

export async function updateEntityPatchInCollection(collection, id, patch = {}) {
  const db = await connectDB();
  await db.collection(collection).updateOne({ _id: toFlexibleId(id) }, { $set: patch });
  return await db.collection(collection).findOne({ _id: toFlexibleId(id) });
}
