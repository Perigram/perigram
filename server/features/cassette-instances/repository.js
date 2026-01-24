/**
 * Cassette Instances Repository
 */
import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';

const COLLECTION = 'cassette_instances';

function toObjectId(id) {
    if (!id) return null;
    if (id instanceof ObjectId) return id;
    try {
        return new ObjectId(id);
    } catch (e) {
        return null;
    }
}

export async function create(data) {

    const db = await connectDB();

    // Fields to exclude as per data-model-review.txt

    const { 

        count, 

        dimensions, 

        status, 

        statusHistory,

        timestamp, 

        userId, 

        success, 

        createdAt, 

        updatedAt, 

        ...cleanData 

    } = data;

    

    const doc = {

        ...cleanData,

        createdAt: new Date(),

        updatedAt: new Date()

    };



    const result = await db.collection(COLLECTION).insertOne(doc);

    return { ...doc, _id: result.insertedId };

}



export async function insertMany(instances) {

    const db = await connectDB();

    const now = new Date();

    const docs = instances.map(i => {

        const { 

            count, 

            dimensions, 

            status, 

            statusHistory,

            timestamp, 

            userId, 

            success, 

            createdAt, 

            updatedAt, 

            ...cleanData 

        } = i;

        return {

            ...cleanData,

            createdAt: now,

            updatedAt: now

        };

    });

    return await db.collection(COLLECTION).insertMany(docs);

}



export async function findByQueue(queueId) {

    const db = await connectDB();

    return await db.collection(COLLECTION).find({ queueId: toObjectId(queueId) }).toArray();

}



/**

 * DEPRECATED: Use Status Service instead

 */

export async function updateStatus(id, status, note, userId) {

    throw new Error('updateStatus in repository is deprecated. Use Status Service: addStatus("cassette_instances", id, status, userId, note)');

}


