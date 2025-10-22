import { defineEventHandler, createError } from 'h3';
import { connectDB } from '~~/server/db/mongo';

export default defineEventHandler(async (event) => {
    const userId = event.context?.auth?.userId;
    if (!userId) {
        throw createError({ statusCode: 401, message: 'Unauthorized' });
    }

    const { name, svgContent } = await readBody(event);

    if (!name || !svgContent) {
        throw createError({ statusCode: 400, message: 'Missing name or svgContent' });
    }

    const db = await connectDB();
    const newPart = {
        ownerId: userId,
        name,
        svgContent,
        createdAt: new Date(),
    };

    const result = await db.collection('parts').insertOne(newPart);

    return { ...newPart, _id: result.insertedId };
});
