import { ObjectId } from 'mongodb';
import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';

// Raw Mongo access for resumable upload sessions (the golden-path
// boundary: services orchestrate, repositories own collections). Chunks
// persist as plain documents so a resumed upload survives server
// restarts; TTL indexes reap abandoned sessions after a day.
const SESSIONS_COLLECTION = 'files_upload_sessions';
const SESSION_CHUNKS_COLLECTION = 'files_upload_chunks';
export const UPLOAD_SESSION_CHUNK_SIZE = 5 * 1024 * 1024;
export const UPLOAD_SESSION_MAX_BYTES = 1024 * 1024 * 1024;
const UPLOAD_SESSION_TTL_SECONDS = 24 * 60 * 60;

let uploadIndexesEnsured = false;

async function ensureUploadSessionIndexes(db) {
  if (uploadIndexesEnsured) return;
  await db.collection(SESSIONS_COLLECTION).createIndex(
    { createdAt: 1 },
    { expireAfterSeconds: UPLOAD_SESSION_TTL_SECONDS }
  );
  await db.collection(SESSION_CHUNKS_COLLECTION).createIndex(
    { createdAt: 1 },
    { expireAfterSeconds: UPLOAD_SESSION_TTL_SECONDS }
  );
  await db.collection(SESSION_CHUNKS_COLLECTION).createIndex(
    { uploadId: 1, index: 1 },
    { unique: true }
  );
  uploadIndexesEnsured = true;
}

export async function insertUploadSession(doc) {
  const db = await connectDB();
  await ensureUploadSessionIndexes(db);
  await db.collection(SESSIONS_COLLECTION).insertOne({ ...doc, _id: new ObjectId() });
  return doc;
}

export async function findUploadSession(uploadId, { userId } = {}) {
  if (!ObjectId.isValid(String(uploadId))) return null;
  const db = await connectDB();
  const doc = await db.collection(SESSIONS_COLLECTION).findOne({ _id: toFlexibleId(uploadId) });
  if (!doc) return null;
  if (userId && String(doc.userId || '') !== String(userId)) return null;
  return doc;
}

export async function listReceivedChunkIndexes(uploadId) {
  const db = await connectDB();
  const received = await db.collection(SESSION_CHUNKS_COLLECTION)
    .distinct('index', { uploadId: toFlexibleId(uploadId) });
  return received.sort((left, right) => left - right);
}

export async function upsertUploadChunk(sessionId, index, buffer) {
  const db = await connectDB();
  await ensureUploadSessionIndexes(db);
  await db.collection(SESSION_CHUNKS_COLLECTION).updateOne(
    { uploadId: toFlexibleId(sessionId), index },
    { $set: { uploadId: toFlexibleId(sessionId), index, data: buffer, createdAt: new Date() } },
    { upsert: true }
  );
}

export async function listUploadChunksSorted(sessionId) {
  const db = await connectDB();
  return db.collection(SESSION_CHUNKS_COLLECTION)
    .find({ uploadId: toFlexibleId(sessionId) })
    .sort({ index: 1 })
    .toArray();
}

export async function deleteUploadSession(sessionId) {
  const db = await connectDB();
  await db.collection(SESSION_CHUNKS_COLLECTION).deleteMany({ uploadId: toFlexibleId(sessionId) });
  await db.collection(SESSIONS_COLLECTION).deleteOne({ _id: toFlexibleId(sessionId) });
}
