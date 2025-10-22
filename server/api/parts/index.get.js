import { defineEventHandler, createError } from 'h3';
import { connectDB } from '~~/server/db/mongo';

export default defineEventHandler(async (event) => {
    const userId = event.context?.auth?.userId;
    if (!userId) {
        throw createError({ statusCode: 401, message: 'Unauthorized' });
    }

    const db = await connectDB();
    const parts = await db.collection('parts').find({ ownerId: userId }).toArray();

    return parts;
});
