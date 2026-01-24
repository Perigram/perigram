/**
 * Status Repository
 */

import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';

const COLLECTION = 'statuses';

export async function create(data) {
    const db = await connectDB();
    const doc = {
        ...data,
        entityId: typeof data.entityId === 'string' ? new ObjectId(data.entityId) : data.entityId,
        timestamp: data.timestamp || new Date()
    };
    const result = await db.collection(COLLECTION).insertOne(doc);
    return { _id: result.insertedId, ...doc };
}

export async function findByEntity(entityId, entityType) {
    const db = await connectDB();
    return await db.collection(COLLECTION)
        .find({ 
            entityId: typeof entityId === 'string' ? new ObjectId(entityId) : entityId,
            entityType 
        })
        .sort({ timestamp: -1 })
        .toArray();
}

export async function findLatestByEntity(entityId, entityType) {
    const db = await connectDB();
    return await db.collection(COLLECTION)
        .findOne(
            { 
                entityId: typeof entityId === 'string' ? new ObjectId(entityId) : entityId,
                entityType 
            },
            { sort: { timestamp: -1 } }
        );
}
