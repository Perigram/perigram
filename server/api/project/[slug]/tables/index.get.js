import { defineEventHandler, createError } from 'h3';
import { connectDB } from '~~/server/db/mongo';

export default defineEventHandler(async (event) => {
    const userId = event.context?.auth?.userId;
    if (!userId) {
        throw createError({ statusCode: 401, message: 'Unauthorized' });
    }

    const projectSlug = event.context.params.slug;

    const db = await connectDB();
    const tables = await db.collection('tables').find({ projectId: projectSlug, ownerId: userId }).toArray();

    return tables;
});
