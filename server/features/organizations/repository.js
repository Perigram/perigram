import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';
import { toFlexibleId } from '../../utils/objectid.js';

const COLLECTION = 'organizations';

export async function create(data) {
  const db = await connectDB();
  const doc = {
    ...data,
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
  return await db.collection(COLLECTION).find(filter).toArray();
}

export async function searchByName(query, limit = 10) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find({ 'identity.name': { $regex: escapeRegex(String(query || '')), $options: 'i' } })
    .sort({ 'identity.name': 1 })
    .limit(limit)
    .toArray();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function updateById(id, updates) {
  const db = await connectDB();
  const { _id, ...clean } = updates;
  await db.collection(COLLECTION).updateOne(
    { _id: toFlexibleId(id) }, 
    { $set: clean }
  );
  return await findById(id);
}

export async function deleteById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).deleteOne({ _id: toFlexibleId(id) });
}

export async function addUserMembership(userId, membership, { organizationId }) {
  const db = await connectDB();
  return await db.collection('users').updateOne(
    { _id: toFlexibleId(userId) },
    {
      $push: { 'data.memberships': membership },
      $set: {
        'lineage.organizationId': organizationId
      }
    }
  );
}

export async function findByIds(ids) {
  const db = await connectDB();
  const flexibleIds = ids.map(id => toFlexibleId(id));
  return await db.collection(COLLECTION).find({ _id: { $in: flexibleIds } }).toArray();
}

export async function setRoleAssignment(organizationId, userId, assignment) {
  const db = await connectDB();
  return await db.collection(COLLECTION).updateOne(
    { _id: toFlexibleId(organizationId) },
    { $set: { [`data.roleAssignments.${String(userId)}`]: assignment } }
  );
}

export async function removeRoleAssignment(organizationId, userId) {
  const db = await connectDB();
  return await db.collection(COLLECTION).updateOne(
    { _id: toFlexibleId(organizationId) },
    { $unset: { [`data.roleAssignments.${String(userId)}`]: '' } }
  );
}
