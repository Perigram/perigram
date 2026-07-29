import { ObjectId } from 'mongodb';
import { connectDB } from '~/server/db/mongo.js';
import { toFlexibleId } from '~/server/utils/objectid.js';

const COLLECTION = 'process_definitions';
const RUNS_COLLECTION = 'orchestration_runs';
const STEPS_COLLECTION = 'orchestration_step_runs';
let runIndexesPromise = null;

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

export async function createRun(run) {
  const db = await connectDB();
  await ensureRunIndexes(db);
  const doc = {
    ...run,
    _id: run._id || new ObjectId(),
    organizationId: toFlexibleId(run.organizationId),
    processDefinitionId: toFlexibleId(run.processDefinitionId),
    revision: 1
  };
  await db.collection(RUNS_COLLECTION).insertOne(doc);
  return doc;
}

export async function findRunById(id) {
  const db = await connectDB();
  return await db.collection(RUNS_COLLECTION).findOne({ _id: toFlexibleId(id) });
}

export async function findDueRuns(now = new Date(), limit = 50) {
  const db = await connectDB();
  return await db.collection(RUNS_COLLECTION)
    .find({ status: 'waiting', wakeAt: { $lte: new Date(now).toISOString() } })
    .sort({ wakeAt: 1 })
    .limit(limit)
    .toArray();
}

export async function updateRun(run) {
  const db = await connectDB();
  const id = toFlexibleId(run._id || run.id);
  const revision = Number(run.revision) || 1;
  const clean = { ...run, _id: undefined, id: undefined, revision: undefined };
  delete clean._id;
  delete clean.id;
  delete clean.revision;
  const result = await db.collection(RUNS_COLLECTION).findOneAndUpdate(
    { _id: id, revision },
    { $set: clean, $inc: { revision: 1 } },
    { returnDocument: 'after' }
  );
  if (!result) throw new Error(`Process run ${id} changed concurrently`);
  return result;
}

export async function claimStep({ runId, nodeId, idempotencyKey, kind, attempt }) {
  const db = await connectDB();
  await ensureRunIndexes(db);
  const now = new Date();
  const step = {
    runId: toFlexibleId(runId),
    nodeId,
    kind,
    attempt,
    idempotencyKey,
    status: 'running',
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now
  };
  try {
    await db.collection(STEPS_COLLECTION).insertOne(step);
    return { claimed: true, step };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return {
      claimed: false,
      step: await db.collection(STEPS_COLLECTION).findOne({ idempotencyKey })
    };
  }
}

function ensureRunIndexes(db) {
  runIndexesPromise ||= Promise.all([
    db.collection(RUNS_COLLECTION).createIndex({ organizationId: 1, updatedAt: -1 }),
    db.collection(RUNS_COLLECTION).createIndex({ status: 1, wakeAt: 1 }),
    db.collection(STEPS_COLLECTION).createIndex({ idempotencyKey: 1 }, { unique: true }),
    db.collection(STEPS_COLLECTION).createIndex({ runId: 1, createdAt: 1 })
  ]);
  return runIndexesPromise;
}

export async function completeStep(idempotencyKey, { status, result = null, error = null }) {
  const db = await connectDB();
  return await db.collection(STEPS_COLLECTION).findOneAndUpdate(
    { idempotencyKey },
    { $set: { status, result, error, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
}
