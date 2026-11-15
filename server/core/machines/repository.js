import { createError } from 'h3';
import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';

// Persistence boundary for workflow state and its append-only status ledger.
// The caller supplies the already-open DB handle so entity reads, evidence
// resolution, and the eventual write share the same connection.
export async function insertStatusEvent(db, record, options = {}) {
  await db.collection('status_events').insertOne(record, options);
  return record;
}

/** The canonical status_events collection owner also serves legacy lifecycle
 * callers until their records are fully represented by the machine event
 * envelope. No feature repository writes this collection independently.
 */
export async function createStatusEvent(data) {
  const db = await connectDB();
  const doc = {
    ...data,
    targetId: toFlexibleId(data.targetId),
    timestamp: data.timestamp || new Date()
  };
  const result = await db.collection('status_events').insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function findStatusEventsByEntity(instanceId, typeId) {
  const db = await connectDB();
  return await db.collection('status_events')
    .find({ targetId: toFlexibleId(instanceId), targetType: typeId })
    .sort({ timestamp: -1 })
    .toArray();
}

export async function findStatusEventsAfter(lastId = null, limit = 200) {
  const db = await connectDB();
  return await db.collection('status_events')
    .find(lastId ? { _id: { $gt: toFlexibleId(lastId) } } : {})
    .sort({ _id: 1 })
    .limit(limit)
    .project({
      targetId: 1,
      targetType: 1,
      fromStatePrimary: 1,
      toStatePrimary: 1,
      'operation.kind': 1,
      actor: 1,
      timestamp: 1
    })
    .toArray();
}

export async function findLatestStatusEventByEntity(instanceId, typeId) {
  const db = await connectDB();
  return await db.collection('status_events').findOne(
    { targetId: toFlexibleId(instanceId), targetType: typeId },
    { sort: { timestamp: -1 } }
  );
}

export async function updateEntityStatus(db, collection, filter, update, options = {}) {
  return await db.collection(collection).updateOne(filter, update, options);
}

export async function writeStatusEventAndEntitySnapshot({
  db,
  collection,
  targetId,
  eventRecord,
  entitySet,
  preferTransaction = false
}) {
  if (preferTransaction) {
    if (!db.client?.startSession) {
      throw createError({ statusCode: 500, message: 'MongoDB transactions are required for combined entity updates' });
    }
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        await insertStatusEvent(db, eventRecord, { session });
        const result = await updateEntityStatus(
          db,
          collection,
          { _id: targetId },
          { $set: entitySet },
          { session }
        );
        if (result.matchedCount !== 1) {
          throw createError({ statusCode: 404, message: 'Status target not found during combined entity update' });
        }
      });
      return;
    } finally {
      await session.endSession();
    }
  }

  await insertStatusEvent(db, eventRecord);
  const result = await updateEntityStatus(
    db,
    collection,
    { _id: targetId },
    { $set: entitySet }
  );
  if (result.matchedCount !== 1) {
    throw createError({ statusCode: 404, message: 'Status target not found during entity status update' });
  }
}
