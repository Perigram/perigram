import { defineEventHandler, getQuery, createError } from 'h3';
import { connectDB } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import { requireAuth } from '../../utils/permissions.js';
import { toFlexibleId } from '../../utils/objectid.js';

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
      targetId: toFlexibleId(targetId),
      targetType: targetType
    })
    .sort({ timestamp: -1 })
    .toArray();
});
