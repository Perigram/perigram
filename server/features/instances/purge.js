// Bulk data death for the type-lifetime law (cts SPEC §4, owner decision
// 2026-10-13): a type that no stored definition declares dies WITH its
// data — instances, status history, and stored files (GridFS metadata
// carries the owning type id). One home for the per-type purge; the
// declaration removal itself stays in cts-types.
import { connectDB } from '~/server/db/mongo';
import { toFlexibleId } from '../../utils/objectid.js';
import { collectionForClass } from './repository.js';

export async function purgeInstancesOfType(typeId, organizationId = null, className = 'file') {
  const db = await connectDB();
  const org = organizationId == null ? null : toFlexibleId(organizationId);
  const scope = { type: String(typeId), ...(org != null ? { organizationId: org } : {}) };
  const instances = await db.collection(collectionForClass(className)).deleteMany(scope);
  // Status history is keyed by target (targetType/targetId) with no org
  // slot — type ids are org-unique, so the type scopes it.
  const statusEvents = await db.collection('status_events').deleteMany({ targetType: String(typeId) });
  // Stored files: both buckets' GridFS metadata carries the owning type.
  let files = 0;
  for (const bucketName of ['uploads', 'files']) {
    const cursor = db.collection(`${bucketName}.files`).find({ 'metadata.type': String(typeId) });
    for await (const file of cursor) {
      try {
        await db.collection(`${bucketName}.chunks`).deleteMany({ files_id: file._id });
        await db.collection(`${bucketName}.files`).deleteOne({ _id: file._id });
        files += 1;
      } catch {
        // A missing chunk pair must not block the purge of the rest.
      }
    }
  }
  return {
    instances: instances.deletedCount || 0,
    statusEvents: statusEvents.deletedCount || 0,
    files
  };
}
