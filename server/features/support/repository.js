import { connectDB } from '~/server/db/mongo';

const COLLECTION = 'supportMessages';
const READS_COLLECTION = 'supportConversationReads';

export async function find(match, projection = {}) {
    const db = await connectDB();
    return await db
        .collection(COLLECTION)
        .find(match)
        .sort({ timestamp: 1 })
        .project(projection)
        .toArray();
}

export async function findSince(match, timestamp, projection = {}) {
    return await find({ $and: [match, { timestamp: { $gt: timestamp } }] }, projection);
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
