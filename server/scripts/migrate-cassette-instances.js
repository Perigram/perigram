// One-way migration (SPEC §13 / facade SPEC): legacy `cassettes` collection
// documents become §3 instance documents in the per-class `files`
// collection under the pack's `cassette` type. Ids are preserved so
// existing references keep resolving. The OCCS template document — legacy
// inline `data.definition` — uploads to the `files` GridFS bucket as the
// instance payload (the one home); STANDARD rows keep their extracted
// geometry as declared fields. The legacy collection is left in place for
// the operator to drop after verification.
//
//   node server/scripts/migrate-cassette-instances.js          # dry-run counts
//   node server/scripts/migrate-cassette-instances.js --apply  # persist
import { ObjectId } from 'mongodb';
import { connectDB } from '../db/mongo.js';
import { uploadFile } from '../features/files/service.js';
import { isOccsDocument } from '../../utils/occs/parameters.js';

const APPLY = process.argv.includes('--apply');

const TEMPLATE_TYPES = ['PARAMETRIC', 'STANDARD'];

function cassetteFields(doc = {}) {
  const data = doc.data || {};
  const fields = {
    name: doc.identity?.name || 'Cassette',
    templateType: TEMPLATE_TYPES.includes(data.type) ? data.type : 'PARAMETRIC',
    parameters: Array.isArray(data.parameters) ? data.parameters : []
  };
  if (data.definition?.mapping && typeof data.definition.mapping === 'object') {
    fields.mapping = data.definition.mapping;
  }
  if (Array.isArray(data.polygonParts)) fields.polygonParts = data.polygonParts;
  if (Array.isArray(data.layerData)) fields.layerData = data.layerData;
  return fields;
}

export async function migrateCassetteInstances(db, { apply = APPLY } = {}) {
  const summary = { scanned: 0, migrated: 0, payloadsUploaded: 0, skipped: 0, invalid: [] };
  const files = db.collection('files');
  const legacy = await db.collection('cassettes').find({}).toArray();

  for (const doc of legacy) {
    summary.scanned += 1;
    const id = doc._id;
    if (await files.findOne({ _id: id, type: 'cassette' }, { projection: { _id: 1 } })) {
      summary.skipped += 1;
      continue;
    }

    const fields = cassetteFields(doc);
    const organizationId = doc.lineage?.organizationId ?? null;
    const state = ['ACTIVE', 'ARCHIVED'].includes(doc.status?.state?.primary)
      ? doc.status.state.primary
      : 'ACTIVE';

    let payload = null;
    const definition = doc.data?.definition;
    if (isOccsDocument(definition)) {
      const buffer = Buffer.from(JSON.stringify(definition), 'utf8');
      const filename = `${fields.name || 'cassette'}.occs`;
      if (apply) {
        const stored = await uploadFile(buffer, filename, { type: 'cassette' }, 'files');
        payload = { fileId: String(stored.id), mime: 'application/perigram+occs', size: buffer.length, name: filename };
        summary.payloadsUploaded += 1;
      }
    }

    const instance = {
      _id: id instanceof ObjectId ? id : new ObjectId(String(id)),
      type: 'cassette',
      typeVersion: 2,
      organizationId: organizationId == null ? null : organizationId,
      name: fields.name,
      fields,
      state,
      lineage: {},
      ...(payload ? { payload } : {}),
      ...(doc.provenance && typeof doc.provenance === 'object' ? { provenance: doc.provenance } : {}),
      createdAt: doc.origin?.timestamp || doc.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (apply) await files.insertOne(instance);
    summary.migrated += 1;
  }
  return summary;
}

async function main() {
  const db = await connectDB();
  const summary = await migrateCassetteInstances(db, { apply: APPLY });
  console.log(`${APPLY ? '[apply]' : '[dry-run]'} ${JSON.stringify(summary)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
