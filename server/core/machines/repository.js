import { createError } from 'h3';

// Persistence boundary for workflow state and its append-only status ledger.
// The caller supplies the already-open DB handle so entity reads, evidence
// resolution, and the eventual write share the same connection.
export async function insertStatusEvent(db, record, options = {}) {
  await db.collection('status_events').insertOne(record, options);
  return record;
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
