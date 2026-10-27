// Durable process executions and events (SPEC: Time and events). A run
// parked on a Wait Until lives in `process_executions` beside the
// definition snapshot it executes; `process_events` is the emitted-event
// ledger the scanner delivers until dispatched.
import { connectDB } from '~/server/db/mongo.js';

const RUNS = 'process_executions';
const EVENTS = 'process_events';

export async function persistRun(definition, run, meta = {}) {
  const db = await connectDB();
  const document = {
    _id: run.id,
    definitionId: String(definition._id || definition.id || ''),
    organizationId: definition.lineage?.organizationId ?? null,
    kind: meta.kind || 'action',
    nodeId: meta.nodeId || '',
    status: run.status,
    wakeAt: run.wakeAt || null,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    definitionData: structuredClone(definition.data),
    run: structuredClone(run)
  };
  await db.collection(RUNS).updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  return document;
}

export async function findDueWakeRuns(now = new Date(), limit = 50) {
  const db = await connectDB();
  return db.collection(RUNS)
    .find({ status: 'waiting', wakeAt: { $lte: new Date(now).toISOString() } })
    .sort({ wakeAt: 1 })
    .limit(limit)
    .toArray();
}

export async function findLastScheduleFire(definitionId, nodeId) {
  const db = await connectDB();
  return db.collection(RUNS)
    .findOne({ kind: 'schedule', definitionId: String(definitionId), nodeId: String(nodeId) }
      , { sort: { createdAt: -1 } });
}

export async function persistEvent(event) {
  const db = await connectDB();
  const document = {
    _id: event.id,
    organizationId: event.organizationId ?? null,
    type: String(event.type || ''),
    payload: structuredClone(event.payload ?? null),
    at: event.at || new Date().toISOString(),
    sourceDefinitionId: event.sourceDefinitionId || '',
    dispatchedAt: null
  };
  await db.collection(EVENTS).insertOne(document);
  return document;
}

export async function findUndispatchedEvents(limit = 100) {
  const db = await connectDB();
  return db.collection(EVENTS)
    .find({ dispatchedAt: null })
    .sort({ at: 1 })
    .limit(limit)
    .toArray();
}

export async function markEventDispatched(eventId) {
  const db = await connectDB();
  await db.collection(EVENTS).updateOne({ _id: eventId }, { $set: { dispatchedAt: new Date().toISOString() } });
}
