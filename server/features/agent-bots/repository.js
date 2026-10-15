import { connectDB } from '../../db/mongo.js';

const COLLECTION = 'agent_bot_subscriptions';

async function collection() {
    const db = await connectDB();
    await db.collection(COLLECTION).createIndex(
        { botUserId: 1, conversationKey: 1 },
        { unique: true }
    );
    return db.collection(COLLECTION);
}

/**
 * A subscription is one bot listening to one conversation: group and
 * instance (organization) chats are opt-in per bot; direct chats answer
 * implicitly and are never subscribed. `conversationKind` and
 * `organizationId` ride the row so triggers and cleanup never re-derive
 * them from the key.
 */
export async function upsertSubscription({ botUserId, conversationKey, conversationKind, organizationId }) {
    const col = await collection();
    await col.updateOne(
        { botUserId: String(botUserId), conversationKey: String(conversationKey) },
        {
            $set: {
                conversationKind: String(conversationKind || ''),
                organizationId: organizationId?.toString?.() || null,
                updatedAt: new Date()
            },
            $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true }
    );
    return { botUserId: String(botUserId), conversationKey: String(conversationKey) };
}

export async function removeSubscription(botUserId, conversationKey) {
    const col = await collection();
    await col.deleteOne({ botUserId: String(botUserId), conversationKey: String(conversationKey) });
    return { removed: true };
}

export async function findSubscriptionsByConversation(conversationKeys = []) {
    if (!conversationKeys.length) return [];
    const col = await collection();
    return await col.find({ conversationKey: { $in: conversationKeys.map(String) } }).toArray();
}

export async function findSubscriptionsByBot(botUserId) {
    const col = await collection();
    return await col.find({ botUserId: String(botUserId) }).toArray();
}

export async function removeSubscriptionsByBot(botUserId) {
    const col = await collection();
    await col.deleteMany({ botUserId: String(botUserId) });
}
