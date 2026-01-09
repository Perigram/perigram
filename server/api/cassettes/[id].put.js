import { service } from '~/server/features/cassettes';

export default defineEventHandler(async (event) => {
  const userId = event.context?.auth?.userId;
  if (!userId) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    });
  }

  const id = getRouterParam(event, 'id');
  const body = await readBody(event);
  
  const { connectDB } = await import('~/server/db/mongo');
  const db = await connectDB();
  const { ObjectId } = await import('mongodb');

  // Verify ownership
  const cassette = await db.collection('cassettes').findOne({ 
    _id: new ObjectId(id),
    userId: userId 
  });

  if (!cassette) {
    throw createError({
      statusCode: 404,
      message: 'Cassette not found or access denied'
    });
  }

  const updates = {
    updatedAt: new Date()
  };

  if (body.name) updates.name = body.name;
  if (body.data) {
    updates.data = body.data;
    updates.parameters = Object.keys(body.data.params || {});
  }

  await db.collection('cassettes').updateOne(
    { _id: new ObjectId(id) },
    { $set: updates }
  );

  return { success: true };
});
