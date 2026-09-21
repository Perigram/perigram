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

export async function findByEntity(entityId, typeId) {
    const db = await connectDB();
    // Singularize typeId for status_events query if needed, 
    // but the service should pass the correct targetType
    return await db.collection(COLLECTION)
        .find({ 
            targetId: toFlexibleId(entityId),
            targetType: typeId 
        })
        .sort({ timestamp: -1 })
        .toArray();
}

export async function findLatestByEntity(entityId, typeId) {
    const db = await connectDB();
    return await db.collection(COLLECTION)
        .findOne(
            { 
                targetId: toFlexibleId(entityId),
                targetType: typeId 
            },
            { sort: { timestamp: -1 } }
        );
}
