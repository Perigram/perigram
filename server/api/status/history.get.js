import { defineEventHandler, getQuery, createError } from 'h3';
import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  
  const query = getQuery(event);
  const { targetId, targetType } = query;

  if (!targetId || !targetType) {
    throw createError({ statusCode: 400, message: 'targetId and targetType are required' });
  }

  const db = await connectDB();
  
  return await db.collection('status_events')
    .find({ 
      targetId: new ObjectId(targetId),
      targetType: targetType
    })
    .sort({ timestamp: -1 })
    .toArray();
});
