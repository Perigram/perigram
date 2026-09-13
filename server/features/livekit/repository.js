import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { toFlexibleId } from '../../utils/objectid.js';

const COLLECTION = 'call_channels';

export async function create(data) {
    const db = await connectDB();
    const doc = {
        ...data,
        _id: data._id || new ObjectId()
    };
    await db.collection(COLLECTION).insertOne(doc);
    return doc;
}

export async function findById(id) {
    const db = await connectDB();
    return await db.collection(COLLECTION).findOne({ _id: toFlexibleId(id) });
}

export async function findByOrganization(organizationId) {
    const db = await connectDB();
    return await db.collection(COLLECTION)
        .find({ 'lineage.organizationId': toFlexibleId(organizationId) })
        .sort({ 'identity.name': 1 })
        .toArray();
}

export async function deleteById(id) {
    const db = await connectDB();
    return await db.collection(COLLECTION).deleteOne({ _id: toFlexibleId(id) });
}
