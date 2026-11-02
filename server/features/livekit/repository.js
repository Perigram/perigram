import { connectDB } from '~/server/db/mongo.js';
import { toFlexibleId } from '~/server/utils/objectid.js';

const COLLECTION = 'call_recordings';

/**
 * Call-recording lifecycle records: one per started room-composite egress.
 * The app owns this record (not LiveKit's egress state) so admission,
 * stop, and the ended-file import survive app restarts. `status` is
 * `recording` until the webhook reports `egress_ended` (`completed`, with
 * the imported message posted) or `egress_failed` (`failed`).
 */
export async function insert(data) {
    const db = await connectDB();
    const record = await db.collection(COLLECTION).insertOne(data);
    return await db.collection(COLLECTION).findOne({ _id: record.insertedId });
}

export async function findByEgressId(egressId) {
    const db = await connectDB();
    return await db.collection(COLLECTION).findOne({ egressId: String(egressId || '') });
}

export async function findActiveByRoom(room) {
    const db = await connectDB();
    return await db.collection(COLLECTION)
        .find({ room: String(room || ''), status: 'recording' })
        .sort({ startedAt: -1 })
        .toArray();
}

export async function findAllActive() {
    const db = await connectDB();
    return await db.collection(COLLECTION)
        .find({ status: 'recording' })
        .sort({ startedAt: -1 })
        .toArray();
}

export async function findStaleActive(startedBefore) {
    const db = await connectDB();
    return await db.collection(COLLECTION)
        .find({ status: 'recording', startedAt: { $lt: startedBefore } })
        .sort({ startedAt: 1 })
        .toArray();
}

export async function updateById(id, update) {
    const db = await connectDB();
    return await db.collection(COLLECTION).findOneAndUpdate(
        { _id: toFlexibleId(id) },
        update,
        { returnDocument: 'after' }
    );
}
