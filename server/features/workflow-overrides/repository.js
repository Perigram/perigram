import { connectDB } from '~/server/db/mongo.js';
import { toFlexibleId } from '~/server/utils/objectid.js';

const COLLECTION = 'workflow_overrides';

// Legacy organization override fallback. The active process graph is the
// primary workflow source; this collection is read-only from application
// code until an explicit, authorized management surface is designed.
export async function findActiveByEntity({ organizationId, typeId }) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({
    organizationId: toFlexibleId(organizationId),
    typeId,
    status: 'ACTIVE'
  });
}
