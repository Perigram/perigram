import { connectDB } from '../../db/mongo.js';

const COLLECTION = 'push_subscriptions';

export async function findByUser(userId) {
    const db = await connectDB();
    return db.collection(COLLECTION)
        .find({ userId: String(userId) })
        .toArray();
}

export async function upsert({ userId, endpoint, keys }) {
    const db = await connectDB();
    const doc = {
        userId: String(userId),
        endpoint,
        keys,
        createdAt: new Date()
    };
    await db.collection(COLLECTION).updateOne(
        { endpoint },
        { $set: doc },
        { upsert: true }
    );
    return doc;
}

export async function removeByEndpoint(endpoint) {
    const db = await connectDB();
    await db.collection(COLLECTION).deleteOne({ endpoint });
}
