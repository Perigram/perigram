import { connectDB } from '~/server/db/mongo';
import { toFlexibleId } from '../../utils/objectid.js';

const COLLECTION = 'status_events';

export async function create(data) {
    const db = await connectDB();
    const doc = {
        ...data,
        targetId: toFlexibleId(data.targetId),
        timestamp: data.timestamp || new Date()
    };
    const result = await db.collection(COLLECTION).insertOne(doc);
    return { ...doc, _id: result.insertedId };
}

export async function findByEntity(instanceId, typeId) {
    const db = await connectDB();
    // Singularize typeId for status_events query if needed, 
    // but the service should pass the correct targetType
    return await db.collection(COLLECTION)
        .find({ 
            targetId: toFlexibleId(instanceId),
            targetType: typeId 
        })
        .sort({ timestamp: -1 })
        .toArray();
}

/**
 * Cursor-based ascending read for lifecycle consumers (the agent bot wake
 * scanner): the events strictly after `lastId` (insertion order), oldest
 * first, projected to the wake-matching fields. The cursor contract is
 * `_id`-based: callers persist the last `_id` they processed.
 */
export async function findAfter(lastId = null, limit = 200) {
    const db = await connectDB();
    return await db.collection(COLLECTION)
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

export async function findLatestByEntity(instanceId, typeId) {
    const db = await connectDB();
    return await db.collection(COLLECTION)
        .findOne(
            { 
                targetId: toFlexibleId(instanceId),
                targetType: typeId 
            },
            { sort: { timestamp: -1 } }
        );
}
