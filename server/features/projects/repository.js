import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';

const COLLECTION = 'projects';

export async function create(data) {
  const db = await connectDB();
  const doc = {
    ...data.toJSON(),
    _id: data.identity.uid
  };
  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

export async function findById(uid) {
  const db = await connectDB();
  const flexId = toFlexibleId(uid);
  
  // Try by _id (flexible)
  let project = await db.collection(COLLECTION).findOne({ _id: flexId });
  
  // Fallback: try by identity.slug or root slug
  if (!project && typeof uid === 'string') {
    project = await db.collection(COLLECTION).findOne({
      $or: [
        { 'identity.slug': uid },
        { 'slug': uid }
      ]
    });
  }
  
  return project;
}

export async function findBySlug(slug) {
  return await findById(slug);
}

export async function find(filter = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION).find(filter).toArray();
}

export async function updateById(uid, updates) {
  const db = await connectDB();
  const flexId = toFlexibleId(uid);
  const { _id, identity, ...clean } = updates;
  await db.collection(COLLECTION).updateOne(
    { _id: flexId }, 
    { $set: clean }
  );
  return await findById(uid);
}

export async function deleteById(uid) {
  const db = await connectDB();
  const flexId = toFlexibleId(uid);
  return await db.collection(COLLECTION).deleteOne({ _id: flexId });
}
