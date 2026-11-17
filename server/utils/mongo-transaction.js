import { connectDB } from '~/server/db/mongo';

export async function withMongoSnapshotTransaction(callback) {
  const db = await connectDB();
  const client = db.client;
  if (!client?.startSession) {
    const error = new Error('Atomic writes require MongoDB transaction support');
    error.statusCode = 503;
    throw error;
  }
  const session = client.startSession();
  try {
    let value;
    await session.withTransaction(async () => {
      value = await callback(session);
      return value;
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary'
    });
    return value;
  } catch (error) {
    if ([20, 303].includes(Number(error?.code))
      || ['IllegalOperation', 'OperationNotSupportedInTransaction'].includes(error?.codeName)
      || /transactions are not supported|transaction numbers are only allowed on a replica set/i.test(error?.message || '')) {
      const unavailable = new Error('Atomic writes require MongoDB transaction support');
      unavailable.statusCode = 503;
      unavailable.cause = error;
      throw unavailable;
    }
    throw error;
  } finally {
    await session.endSession();
  }
}
