import { connectDB } from '../db/mongo.js';
import { createHash } from 'node:crypto';

const APPLY = process.argv.includes('--apply');

export function revisionDocument(artifact = {}) {
  const file = artifact.attachments?.primary;
  if (!artifact._id || !file?.fileId) return null;
  const sourceId = String(artifact._id);
  const hash = createHash('sha256').update(`${sourceId}:${file.fileId}`).digest('hex');
  return {
    _id: `revision:artifact:${sourceId}:file:1`,
    identity: { uid: `revision:artifact:${sourceId}:file:1`, name: `artifact file v1`, slug: `artifact-file-v1`, serial: '', reference: '' },
    origin: artifact.origin || artifact.status,
    status: artifact.status || artifact.origin,
    lineage: { ...(artifact.lineage || {}), artifactId: artifact._id },
    attachments: { primary: file },
    data: {
      source: { type: 'artifact', id: sourceId }, scope: 'file', number: 1,
      contentHash: `sha256:${hash}`,
      snapshot: { identity: artifact.identity || null, data: { type: artifact.data?.type, layout: artifact.data?.layout || null, values: artifact.data?.values || {} } },
      sourceStatus: artifact.status || null, reason: 'migration'
    }
  };
}

async function main() {
  const db = await connectDB();
  const artifacts = await db.collection('artifacts').find({ 'attachments.primary.fileId': { $exists: true } }).toArray();
  let changed = 0;
  for (const artifact of artifacts) {
    const revision = revisionDocument(artifact);
    if (!revision) continue;
    changed += 1;
    if (!APPLY) continue;
    await db.collection('entity_revisions').updateOne({ _id: revision._id }, { $setOnInsert: revision }, { upsert: true });
    const revisions = { ...(artifact.data?.revisions || {}) };
    revisions.file ||= { currentId: revision._id, number: 1, contentHash: revision.data.contentHash };
    if (artifact.data?.activeRevisionId && !revisions.layout) revisions.layout = { currentId: artifact.data.activeRevisionId };
    await db.collection('artifacts').updateOne({ _id: artifact._id }, { $set: { 'data.revisions': revisions }, $unset: { 'data.activeRevisionId': '' } });
  }
  console.log(`${APPLY ? '[apply]' : '[dry-run]'} ${JSON.stringify({ scanned: artifacts.length, changed })}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(error => { console.error(error); process.exitCode = 1; });
