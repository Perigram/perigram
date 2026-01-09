import { service } from '~/server/features/cassettes';

export default defineEventHandler(async (event) => {
  const userId = event.context?.auth?.userId;
  if (!userId) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    });
  }

  const body = await readBody(event);
  
  if (!body.name) {
    throw createError({
      statusCode: 400,
      message: 'Name is required'
    });
  }

  // If it's a parametric cassette (has 'data' field)
  if (body.data) {
    const { connectDB } = await import('~/server/db/mongo');
    const db = await connectDB();
    
    const cassetteData = {
      name: body.name,
      slug: body.slug || `parametric-${Date.now()}`,
      userId: userId,
      type: 'PARAMETRIC',
      data: body.data, // The high-level tree/parameters
      parameters: Object.keys(body.data.params || {}),
      processingStatus: 'completed',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await db.collection('cassettes').insertOne(cassetteData);
    return { ...cassetteData, _id: result.insertedId };
  }
  
  // Otherwise, use standard creation logic (not implemented for simple JSON yet, 
  // but we can extend standard service if needed)
  return await service.create(body, userId);
});
