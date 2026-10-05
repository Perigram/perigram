// One-shot stored-shape migration: public voice-message transcripts (the
// retired contract wrote the transcript into the message body with a
// `transcription` marker on the audio descriptor) become per-user
// `supportTranscripts` documents (support README, Transcription), the body
// is cleared, and the marker is removed. The transcript is granted to every
// participant the message names — the readers the public body reached.
// Idempotent: messages without the marker are untouched, and re-running
// after --apply scans zero candidates.
//
//   node server/scripts/migrate-support-transcripts.js          # dry-run counts
//   node server/scripts/migrate-support-transcripts.js --apply  # persist
import { connectDB } from '../db/mongo.js';

export async function migrateSupportTranscripts(db, { apply = process.argv.includes('--apply') } = {}) {
  const coll = db.collection('supportMessages');
  const transcripts = db.collection('supportTranscripts');
  const match = { 'attachments.transcription': { $exists: true }, message: { $ne: '' } };
  const candidates = await coll.countDocuments(match);
  const summary = { candidates, transcripts: 0, migrated: 0 };
  if (!apply || !candidates) return summary;
  const now = new Date();
  const docs = await coll.find(match).toArray();
  for (const doc of docs) {
    const marker = (doc.attachments || []).find(attachment => attachment?.transcription) || {};
    const provenance = marker.transcription || {};
    const readers = [...new Set([...(doc.participants || []).map(String), String(doc.senderUserId || '')].filter(Boolean))];
    for (const userId of readers) {
      const filter = { messageId: String(doc._id), userId };
      const exists = await transcripts.countDocuments(filter, { limit: 1 });
      if (exists) continue;
      await transcripts.updateOne(
        filter,
        {
          $set: {
            text: doc.message,
            provider: provenance.provider || '',
            model: provenance.model || '',
            transcribedAt: provenance.transcribedAt || doc.timestamp || now,
            updatedAt: now
          },
          $setOnInsert: { createdAt: now }
        },
        { upsert: true }
      );
      summary.transcripts += 1;
    }
    const result = await coll.updateOne(
      { _id: doc._id },
      { $set: { message: '' }, $unset: { 'attachments.$[element].transcription': '' } },
      { arrayFilters: [{ 'element.transcription': { $exists: true } }] }
    );
    summary.migrated += result.modifiedCount || 0;
  }
  return summary;
}

async function main() {
  const db = await connectDB();
  const summary = await migrateSupportTranscripts(db);
  console.log(`migrate-support-transcripts: ${summary.migrated}/${summary.candidates} message(s) migrated, ${summary.transcripts} transcript(s) written${process.argv.includes('--apply') ? '' : ' (dry run)'}`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
