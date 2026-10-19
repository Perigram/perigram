// One-shot migration (SPEC §Owner direction 2026-10-19, ordered CSG
// sequence): the boolean fold crosses from the grouped law (every add
// before every subtract) to the authored sequence, where a later add
// refills an earlier cut. Stored sketches authored under the grouped
// law get their shapes sequenced grouped — adds in stored order,
// then subtracts in stored order, then construction — so every stored
// profile evaluates identically before and after the semantic change.
// Idempotent: already-sequenced sketches (no subtract above an add)
// skip.
//
//   node server/scripts/migrate-profile-ops-to-sequence.js          # dry-run counts
//   node server/scripts/migrate-profile-ops-to-sequence.js --apply
import { GridFSBucket } from 'mongodb';
import { connectDB } from '../db/mongo.js';

const APPLY = process.argv.includes('--apply');

const sequencedSketch = (sketch) => {
  if (!sketch || !Array.isArray(sketch.shapes)) return null;
  const rank = { add: 0, subtract: 1, construction: 2 };
  const ranks = sketch.shapes.map(shape => rank[shape?.op] ?? 0);
  if (ranks.every((rankAt, index) => index === 0 || ranks[index - 1] <= rankAt)) return null;
  const byRank = { 0: [], 1: [], 2: [] };
  for (const shape of sketch.shapes) byRank[rank[shape?.op] ?? 0].push(shape);
  return {
    ...sketch,
    shapes: [...byRank[0], ...byRank[1], ...byRank[2]]
  };
};

const db = await connectDB();
const bucket = new GridFSBucket(db._db || db, { bucketName: 'files' });

let profilesRead = 0;
let profilesMigrated = 0;

const items = db.collection('items');
const profileRecords = await items.find({ type: 'profile' }).toArray();
for (const record of profileRecords) {
  profilesRead += 1;
  const sequenced = sequencedSketch(record.fields?.sketch);
  if (!sequenced) continue;
  profilesMigrated += 1;
  if (APPLY) {
    await items.updateOne(
      { _id: record._id },
      { $set: { 'fields.sketch': sequenced, updatedAt: new Date() } }
    );
  }
}

let cassettesRead = 0;
let cassettesMigrated = 0;
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
  const tree = document?.extensions?.perigram?.graphTree;
  for (const workpiece of tree?.workpieces || []) {
    const sequenced = sequencedSketch(workpiece.profileSnapshot?.sketch);
    if (sequenced) {
      workpiece.profileSnapshot.sketch = sequenced;
      workpiece.profileSnapshot.section = null;
      workpiece.profileSnapshot.occsProfile = null;
      changed = true;
    }
  }
  for (const definition of document?.definitions?.workpieces || []) {
    const sequenced = sequencedSketch(definition?.extensions?.perigram?.sketch);
    if (sequenced) {
      definition.extensions.perigram.sketch = sequenced;
      if (definition.profile) definition.profile.section = null;
      changed = true;
    }
  }

  if (!changed) continue;
  cassettesMigrated += 1;
  if (APPLY) {
    const buffer = Buffer.from(JSON.stringify(document), 'utf8');
    const uploadStream = bucket.openUploadStream(`cassette-${record._id}.occs`, {
      contentType: 'application/perigram+occs',
      metadata: { type: 'cassette', migrated: 'profile-op-sequence' }
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

console.log(`profiles: ${profilesMigrated}/${profilesRead} migrated${APPLY ? '' : ' (dry run)'}`);
console.log(`cassettes: ${cassettesMigrated}/${cassettesRead} migrated${APPLY ? '' : ' (dry run)'}`);
if (payloadErrors) console.log(`cassette payloads unreadable: ${payloadErrors}`);
if (!APPLY) console.log('re-run with --apply to persist');
process.exit(0);
