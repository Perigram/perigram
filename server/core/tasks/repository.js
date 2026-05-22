import { ObjectId } from 'mongodb';
import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';

const COLLECTION = 'task_runs';

export async function create(doc) {
  const db = await connectDB();
  const now = new Date();
  const record = {
    ...doc,
    status: doc.status || 'QUEUED',
    attempts: doc.attempts || 0,
    maxAttempts: doc.maxAttempts || 3,
    priority: doc.priority || 0,
    createdAt: doc.createdAt || now,
    updatedAt: now
  };
  const result = await db.collection(COLLECTION).insertOne(record);
  return { ...record, _id: result.insertedId };
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: toFlexibleId(id) });
}

export async function findByIdempotencyKey(taskId, idempotencyKey) {
  if (!idempotencyKey) return null;
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ taskId, idempotencyKey });
}

export async function claimNext({ taskId, workerType, workerId, claimToken, leaseExpiresAt, now = new Date() }) {
  const db = await connectDB();
  const query = {
    $or: [
      {
        status: { $in: ['QUEUED', 'RETRY_WAIT'] },
        $or: [{ runAfter: { $exists: false } }, { runAfter: { $lte: now } }]
      },
      {
        status: 'RUNNING',
        leaseExpiresAt: { $lte: now }
      }
    ]
  };
  if (taskId) query.taskId = taskId;
  if (workerType) query.workerType = workerType;

  return await db.collection(COLLECTION).findOneAndUpdate(
    query,
    {
      $set: {
        status: 'RUNNING',
        workerId,
        claimToken,
        leaseExpiresAt,
        startedAt: now,
        updatedAt: now
      },
      $inc: { attempts: 1 }
    },
    { sort: { priority: -1, createdAt: 1 }, returnDocument: 'after' }
  );
}

export async function startById(id, workerId) {
  const db = await connectDB();
  await db.collection(COLLECTION).updateOne(
    { _id: id instanceof ObjectId ? id : toFlexibleId(id), status: { $in: ['QUEUED', 'RUNNING'] } },
    {
      $set: {
        status: 'RUNNING',
        lockedBy: workerId,
        lockedAt: new Date(),
        startedAt: new Date(),
        updatedAt: new Date()
      },
      $inc: { attempts: 1 }
    }
  );
  return await findById(id);
}

export async function updateById(id, update) {
  const db = await connectDB();
  await db.collection(COLLECTION).updateOne(
    { _id: id instanceof ObjectId ? id : toFlexibleId(id) },
    { $set: { ...update, updatedAt: new Date() } }
  );
  return await findById(id);
}

export async function updateClaimedById(id, claimToken, update) {
  const db = await connectDB();
  await db.collection(COLLECTION).updateOne(
    { _id: id instanceof ObjectId ? id : toFlexibleId(id), claimToken, status: 'RUNNING' },
    { $set: { ...update, updatedAt: new Date() } }
  );
  return await findById(id);
}

export async function list(filter = {}) {
  const db = await connectDB();
  const { limit = 50, ...query } = filter;
  for (const key of Object.keys(query)) {
    if (query[key] === undefined || query[key] === null || query[key] === '') delete query[key];
  }
  return await db.collection(COLLECTION)
    .find(query)
    .sort({ createdAt: -1 })
    .limit(Number(limit) || 50)
    .toArray();
}
