import { defineEventHandler } from 'h3';
import { requirePermission } from '~/server/utils/permissions';
import { ObjectId } from 'mongodb';

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'users', 'admin');
  const invId = event.context.params.invId;
  
  const db = await (await import('~/server/db/mongo')).connectDB();
  await db.collection('invitations').updateOne(
    { _id: new ObjectId(invId) },
    { $set: { isActive: false, revokedAt: new Date() } }
  );
  
  return { success: true };
});
