import { defineEventHandler, createError } from 'h3';
import { connectDB } from '~~/server/db/mongo';

export default defineEventHandler(async (event) => {
    const userId = event.context?.auth?.userId;
    if (!userId) {
        throw createError({ statusCode: 401, message: 'Unauthorized' });
    }

    const projectSlug = event.context.params.slug;
    const { name } = await readBody(event);

    if (!name) {
        throw createError({ statusCode: 400, message: 'Table name is required' });
    }

    const db = await connectDB();
    const newTable = {
        projectId: projectSlug,
        ownerId: userId,
        name,
        status: 'validated', // Created tables are empty and thus validated
        createdAt: new Date(),
        data: [], // Start with an empty data array
    };

    const result = await db.collection('tables').insertOne(newTable);

    return { ...newTable, _id: result.insertedId };
});
