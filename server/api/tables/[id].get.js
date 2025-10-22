import { defineEventHandler, createError } from 'h3';
import { connectDB } from '~~/server/db/mongo';
import { ObjectId } from 'mongodb';

export default defineEventHandler(async (event) => {
    const userId = event.context?.auth?.userId;
    if (!userId) {
        throw createError({ statusCode: 401, message: 'Unauthorized' });
    }

    const tableId = event.context.params.id;

    const db = await connectDB();
    const table = await db.collection('tables').findOne({ _id: new ObjectId(tableId), ownerId: userId });

    if (!table) {
        throw createError({ statusCode: 404, message: 'Table not found' });
    }

    return table;
});
