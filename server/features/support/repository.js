import { connectDB } from '~/server/db/mongo';
import { toFlexibleId } from '~/server/utils/objectid.js';

const COLLECTION = 'supportMessages';
const READS_COLLECTION = 'supportConversationReads';
const GROUPS_COLLECTION = 'chat_groups';
const PREFS_COLLECTION = 'supportConversationPrefs';

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

export async function findById(id, projection = {}) {
    const db = await connectDB();
    return await db.collection(COLLECTION).findOne({ _id: toFlexibleId(id) }, { projection });
}

export async function updateById(id, update, projection = {}, options = {}) {
    const db = await connectDB();
    return await db.collection(COLLECTION).findOneAndUpdate(
        { _id: toFlexibleId(id) },
        update,
        { returnDocument: 'after', projection, ...options }
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

// Per-user conversation preferences (pin/archive). One document per user and
// conversation; timestamps double as existence flags.
export async function findConversationPrefs(userId, conversationKeys = []) {
    if (!userId || !conversationKeys.length) return [];
    const db = await connectDB();
    return await db
        .collection(PREFS_COLLECTION)
        .find({ userId, conversationKey: { $in: conversationKeys } })
        .toArray();
}

export async function upsertConversationPref(userId, conversationKey, patch = {}) {
    const db = await connectDB();
    const now = new Date();
    const update = {};
    if (patch.pinned === true) update.pinnedAt = now;
    if (patch.pinned === false) update.pinnedAt = null;
    if (patch.archived === true) update.archivedAt = now;
    if (patch.archived === false) update.archivedAt = null;
    if (Object.keys(update).length) {
        await db.collection(PREFS_COLLECTION).updateOne(
            { userId, conversationKey },
            {
                $set: { ...update, userId, conversationKey, updatedAt: now },
                $setOnInsert: { createdAt: now }
            },
            { upsert: true }
        );
    }
    return await db.collection(PREFS_COLLECTION).findOne({ userId, conversationKey });
}

// Latest read timestamp per conversation among every OTHER user: the input
// for the own-last-message read mark.
export async function findOthersReadStates(conversationKeys = [], excludeUserId = '') {
    if (!conversationKeys.length) return [];
    const db = await connectDB();
    const match = excludeUserId
        ? { conversationKey: { $in: conversationKeys }, userId: { $ne: excludeUserId } }
        : { conversationKey: { $in: conversationKeys } };
    const rows = await db
        .collection(READS_COLLECTION)
        .find(match)
        .toArray();
    const latestByKey = new Map();
    for (const row of rows) {
        const current = latestByKey.get(row.conversationKey);
        if (!current || new Date(row.lastReadAt) > new Date(current)) {
            latestByKey.set(row.conversationKey, row.lastReadAt);
        }
    }
    return Array.from(latestByKey.entries())
        .map(([conversationKey, lastReadAt]) => ({ conversationKey, lastReadAt }));
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
