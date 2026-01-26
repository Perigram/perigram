import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'status_events';

export async function create(data) {
    const db = await connectDB();
    const doc = {
        ...data,
        targetId: typeof data.targetId === 'string' ? new ObjectId(data.targetId) : data.targetId,
        timestamp: data.timestamp || new Date()
    };
    const result = await db.collection(COLLECTION).insertOne(doc);
    return { ...doc, _id: result.insertedId };
}

export async function findByEntity(entityId, entityType) {
    const db = await connectDB();
    // Singularize entityType for status_events query if needed, 
    // but the service should pass the correct targetType
    return await db.collection(COLLECTION)
        .find({ 
            targetId: typeof entityId === 'string' ? new ObjectId(entityId) : entityId,
            targetType: entityType 
        })
        .sort({ timestamp: -1 })
        .toArray();
}

export async function findLatestByEntity(entityId, entityType) {
    const db = await connectDB();
    return await db.collection(COLLECTION)
        .findOne(
            { 
                targetId: typeof entityId === 'string' ? new ObjectId(entityId) : entityId,
                targetType: entityType 
            },
            { sort: { timestamp: -1 } }
        );
}