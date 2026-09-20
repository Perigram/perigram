// Instance existence probe for the authoring path: whether any persisted
// instance of a type exists in an organization's scope (org rows plus the
// system catalog — org types never have system rows, but the probe stays
// total). Scans the per-class collections by type discriminator.
import { connectDB } from '~/server/db/mongo';
import { toFlexibleId } from '../../utils/objectid.js';
import { CLASS_COLLECTIONS } from '~/packages/cts/src/index.js';

export async function countInstancesOfType(typeId, organizationId) {
  if (!typeId) return 0;
  const organization = organizationId ? toFlexibleId(organizationId) : null;
  const scope = organization
    ? { $or: [{ organizationId: organization }, { organizationId: null }] }
    : {};
  const db = await connectDB();
  let total = 0;
  for (const collection of Object.values(CLASS_COLLECTIONS)) {
    total += await db.collection(collection).countDocuments({ type: typeId, ...scope });
  }
  return total;
}
