import { defineEventHandler, createError } from 'h3';
import { connectDB } from '~~/server/db/mongo';
import { ObjectId } from 'mongodb';

export default defineEventHandler(async (event) => {
    const userId = event.context?.auth?.userId;
    if (!userId) {
        throw createError({ statusCode: 401, message: 'Unauthorized' });
    }

    const partId = event.context.params.id;

    const db = await connectDB();
    const result = await db.collection('parts').deleteOne({ _id: new ObjectId(partId), ownerId: userId });

    if (result.deletedCount === 0) {
        throw createError({ statusCode: 404, message: 'Part not found' });
    }

    return { success: true };
});
