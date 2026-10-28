// One-shot facade type-family rename (facade SPEC, owner direction
// 2026-10-28): the `cassette` type id renames to `cassette-template`.
// Runs BEFORE the org upgrades past listing v22 — the upgrade gate
// refuses a removed type with live instances, so stored instances,
// stored refs, and authored process definitions rewrite here first.
// Sheet-design's title→name and parts removal ride the listing's own
// migrate steps at upgrade time. Authored solve wirings that fed the
// retired `cassetteId` item input re-author onto `designId` (the
// demo process composes fresh from test-data).
//
// Dry-run by default; `--apply` persists. Idempotent: re-running is a
// no-op. Runbook: node server/scripts/migrate-facade-type-family.js [--apply]
import { connectDB } from '../db/mongo.js';

const FROM_TYPE = 'cassette';
const TO_TYPE = 'cassette-template';

const apply = process.argv.includes('--apply');
const db = await connectDB();

const report = { mode: apply ? 'apply' : 'dry-run', instancesRenamed: 0, refsRewritten: 0, definitionsRewritten: 0, nodesRewritten: 0 };

// Stored ref objects anywhere in a document: { type: 'cassette', id }.
function rewriteRefs(value) {
  let count = 0;
  if (Array.isArray(value)) {
    for (const entry of value) count += rewriteRefs(entry);
    return count;
  }
  if (!value || typeof value !== 'object' || value instanceof Date) return count;
  if (value.type === FROM_TYPE && value.id != null) {
    value.type = TO_TYPE;
    count += 1;
  }
  for (const entry of Object.values(value)) count += rewriteRefs(entry);
  return count;
}

// Authored graph records: type ids on records, binds, and entity
// descriptors.
function rewriteGraphRecords(graph = {}) {
  let nodes = 0;
  const walkRecords = (records = {}) => {
    for (const record of Object.values(records)) {
      if (!record || typeof record !== 'object') continue;
      let changed = false;
      if (record.typeId === FROM_TYPE) { record.typeId = TO_TYPE; changed = true; }
      if (record.preset?.typeId === FROM_TYPE) { record.preset.typeId = TO_TYPE; changed = true; }
      for (const field of ['type', 'via', 'operator']) {
        if (record[field] === FROM_TYPE) { record[field] = TO_TYPE; changed = true; }
      }
      const typeDescriptor = record.type || record.preset?.type;
      if (typeDescriptor && typeof typeDescriptor === 'object' && typeDescriptor.typeId === FROM_TYPE) {
        typeDescriptor.typeId = TO_TYPE;
        changed = true;
      }
      if (Array.isArray(record.accepts)) {
        record.accepts = record.accepts.map(entry => (entry === FROM_TYPE ? TO_TYPE : entry));
      }
      if (changed) nodes += 1;
    }
  };
  walkRecords(graph.nodes);
  walkRecords(graph.records);
  walkRecords(graph.declarations);
  return nodes;
}

const persist = apply
  ? (collection, filter, update) => db.collection(collection).updateOne(filter, update)
  : async () => ({ matchedCount: 1 });

for (const collection of ['files', 'items', 'groups', 'processes']) {
  const docs = await db.collection(collection).find({ type: FROM_TYPE }).toArray();
  for (const doc of docs) {
    await persist(collection, { _id: doc._id }, { $set: { type: TO_TYPE, typeVersion: 1 } });
    report.instancesRenamed += 1;
  }

  const withRefs = await db.collection(collection)
    .find({ $or: [{ 'fields.template.type': FROM_TYPE }, { 'relations.parts.type': FROM_TYPE }] })
    .toArray();
  for (const doc of withRefs) {
    let refs = rewriteRefs(doc.fields);
    if (doc.relations) refs += rewriteRefs(doc.relations);
    report.refsRewritten += refs;
    await persist(collection, { _id: doc._id }, { $set: { fields: doc.fields, ...(doc.relations ? { relations: doc.relations } : {}) } });
  }
}

const definitions = await db.collection('process_definitions').find({}).toArray();
for (const definition of definitions) {
  const added = rewriteGraphRecords(definition.graph || {});
  if (added > 0) {
    report.definitionsRewritten += 1;
    report.nodesRewritten += added;
    await persist('process_definitions', { _id: definition._id }, { $set: { graph: definition.graph } });
  }
}

console.log(JSON.stringify(report, null, 2));
console.log(apply ? 'restart the app to rebuild declaration caches' : 'dry-run — pass --apply to persist');
process.exit(0);
