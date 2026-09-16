import { connectDB } from '~/server/db/mongo';
import { toFlexibleId } from '~/server/utils/objectid.js';

const COLLECTION = 'supportMessages';
const READS_COLLECTION = 'supportConversationReads';
const GROUPS_COLLECTION = 'chat_groups';

/**
 * Conversation page read. With `options.limit` the newest `limit` messages
 * (optionally older than `options.before`, an ISO timestamp cursor) come back
 * still in ascending order, so callers consume one stable ordering for full
 * snapshots and lazy-loaded history pages alike.
 */
export async function find(match, projection = {}, options = {}) {
    const db = await connectDB();
    const query = { ...match };
    if (options.before) {
        const cursor = new Date(options.before);
        if (!Number.isNaN(cursor.getTime())) {
            query.timestamp = { ...(match.timestamp || {}), $lt: cursor };
        }
    }
    let cursor = db
        .collection(COLLECTION)
        .find(query)
        .sort({ timestamp: -1, _id: -1 });
    if (options.limit) cursor = cursor.limit(options.limit);
    const page = await cursor.project(projection).toArray();
    return page.reverse();
}

export async function insert(data, projection = {}) {
    const db = await connectDB();
    const record = await db.collection(COLLECTION).insertOne(data);
    return await db.collection(COLLECTION).findOne(
        { _id: record.insertedId },
        { projection }
    );
}

export async function findConversationMessages(match, projection = {}) {
    const db = await connectDB();
    return await db
        .collection(COLLECTION)
        .find(match)
        .sort({ timestamp: -1 })
        .project(projection)
        .toArray();
}

export async function findReadStates(userId, conversationKeys = []) {
    if (!userId || !conversationKeys.length) return [];
    const db = await connectDB();
    return await db
        .collection(READS_COLLECTION)
        .find({ userId, conversationKey: { $in: conversationKeys } })
        .toArray();
}

export async function markRead(conversationKey, userId, readAt = new Date()) {
    const db = await connectDB();
    await db.collection(READS_COLLECTION).updateOne(
        { conversationKey, userId },
        {
            $set: {
                conversationKey,
                userId,
                lastReadAt: readAt,
                updatedAt: new Date()
            }
        },
        { upsert: true }
    );
    return await db.collection(READS_COLLECTION).findOne({ conversationKey, userId });
}

export async function insertGroup(data) {
    const db = await connectDB();
    const record = await db.collection(GROUPS_COLLECTION).insertOne(data);
    return await db.collection(GROUPS_COLLECTION).findOne({ _id: record.insertedId });
}

export async function findGroupById(id) {
    const db = await connectDB();
    return await db.collection(GROUPS_COLLECTION).findOne({ _id: toFlexibleId(id) });
}

export async function findGroupsByParticipant(userId, organizationId) {
    const db = await connectDB();
    return await db.collection(GROUPS_COLLECTION)
        .find({
            participants: String(userId),
            'lineage.organizationId': toFlexibleId(organizationId)
        })
        .sort({ 'identity.name': 1 })
        .toArray();
}

export async function deleteGroupById(id) {
    const db = await connectDB();
    return await db.collection(GROUPS_COLLECTION).deleteOne({ _id: toFlexibleId(id) });
}
