// One-shot migration (workers/facade/SPEC.md — two parameter tables):
// stored cassette documents move a profile workpiece's instance table out
// of the authored sketch. The workpiece's chip table becomes
// `profileSnapshot.instance`, the authored table stays inside
// `profileSnapshot.sketch.parameters`, and the retired
// `profileSnapshot.parameters` mirror and workpiece-level `parameters`
// drop. Values already folded into the authored table by an earlier
// dialog save stay there — the original defaults are not recoverable.
// Idempotent: a workpiece already carrying `instance` skips.
//
//   node server/scripts/migrate-profile-parameter-tables.js          # dry-run counts
//   node server/scripts/migrate-profile-parameter-tables.js --apply
import { GridFSBucket } from 'mongodb';
import { connectDB } from '../db/mongo.js';

const APPLY = process.argv.includes('--apply');

const isProfileWorkpiece = (workpiece) => workpiece?.type === 'profile' || Boolean(workpiece?.profile);

// The instance table a stored workpiece carries: the new slot first, then
// the two retired ones (the chip table and the derived mirror).
const storedInstanceOf = (workpiece, snapshot) => {
  if (snapshot.instance) return null;
  return { ...(workpiece.parameters || snapshot.parameters || {}) };
};

const migrateWorkpiece = (workpiece) => {
  if (!isProfileWorkpiece(workpiece)) return false;
  const snapshot = workpiece.profileSnapshot || workpiece.profile || {};
  const instance = storedInstanceOf(workpiece, snapshot);
  if (!instance) return false;
  const sketch = snapshot.sketch || workpiece.sketch || null;
  if (workpiece.parameters) delete workpiece.parameters;
  const { parameters: derivedMirror, ...rest } = snapshot;
  const next = {
    ...rest,
    instance,
    ...(sketch ? { sketch } : {})
  };
  workpiece.profileSnapshot = next;
  return true;
};

const db = await connectDB();
const bucket = new GridFSBucket(db._db || db, { bucketName: 'files' });

let cassettesRead = 0;
let cassettesMigrated = 0;
let workpiecesMigrated = 0;
let payloadErrors = 0;

const files = db.collection('files');
const cassettes = await files.find({ type: 'cassette' }).toArray();
for (const record of cassettes) {
  cassettesRead += 1;
  const fileId = record.content?.fileId;
  if (!fileId) continue;
  let document = null;
  try {
    const chunks = [];
    const stream = bucket.openDownloadStream(fileId);
    for await (const chunk of stream) chunks.push(chunk);
    document = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    payloadErrors += 1;
    continue;
  }

  let changed = false;
  const workpieces = document?.extensions?.perigram?.graphTree?.workpieces || [];
  for (const workpiece of workpieces) {
    if (!migrateWorkpiece(workpiece)) continue;
    changed = true;
    workpiecesMigrated += 1;
  }
  // The definition mirrors its workpiece's instance table.
  for (const definition of document?.definitions?.workpieces || []) {
    if (definition?.type !== 'profile') continue;
    const workpiece = workpieces.find(item => (item.definitionId || `${item.id}_def`) === definition.id);
    if (!workpiece) continue;
    definition.parameters = { ...(workpiece.profileSnapshot?.instance || {}) };
    changed = true;
  }

  if (!changed) continue;
  cassettesMigrated += 1;
  if (APPLY) {
    const buffer = Buffer.from(JSON.stringify(document), 'utf8');
    const uploadStream = bucket.openUploadStream(`cassette-${record._id}.occs`, {
      contentType: 'application/perigram+occs',
      metadata: { type: 'cassette', migrated: 'profile-parameter-tables' }
    });
    uploadStream.end(buffer);
    const uploaded = await new Promise((resolve, reject) => {
      uploadStream.on('finish', () => resolve(uploadStream.id));
      uploadStream.on('error', reject);
    });
    await files.updateOne(
      { _id: record._id },
      { $set: { 'content.fileId': uploaded, 'content.size': buffer.length, updatedAt: new Date() } }
    );
  }
}

console.log(`cassettes: ${cassettesMigrated}/${cassettesRead} migrated, ${workpiecesMigrated} profile workpieces${APPLY ? '' : ' (dry run)'}`);
if (payloadErrors) console.log(`cassette payloads unreadable: ${payloadErrors}`);
if (!APPLY) console.log('re-run with --apply to persist');
process.exit(0);
