import { defineEventHandler, createError } from 'h3';
import { connectDB } from '~~/server/db/mongo';
import { ObjectId } from 'mongodb';

export default defineEventHandler(async (event) => {
    const userId = event.context?.auth?.userId;
    if (!userId) {
        throw createError({ statusCode: 401, message: 'Unauthorized' });
    }

    const tableId = event.context.params.id;
    const updateData = await readBody(event);

    const db = await connectDB();
    const table = await db.collection('tables').findOne({ _id: new ObjectId(tableId), ownerId: userId });

    if (!table) {
        throw createError({ statusCode: 404, message: 'Table not found' });
    }

    // This is a generic update endpoint. We can add more specific logic here later.
    // For example, to update a single row for file matching:
    if (updateData.rowIndex !== undefined && updateData.rowData) {
        const updateField = `data.${updateData.rowIndex}`;
        await db.collection('tables').updateOne(
            { _id: new ObjectId(tableId) },
            { $set: { [updateField]: updateData.rowData } }
        );
    } else {
        // For other general updates
        await db.collection('tables').updateOne(
            { _id: new ObjectId(tableId) },
            { $set: updateData }
        );
    }

    const updatedTable = await db.collection('tables').findOne({ _id: new ObjectId(tableId) });

    return updatedTable;
});
