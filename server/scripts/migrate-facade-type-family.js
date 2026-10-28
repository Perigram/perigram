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

// Authored graph records: type bindings on the persisted draft shape
// (`data.processNodes.*`, `data.ctsTypes.*`, `data.graph.nodes.*`,
// `data.producerOutputs.*`, and the draft's history snapshots). Only
// type-binding slots rewrite — `typeId` fields and `{type, id}` ref
// objects — so same-named non-type vocabulary (a join column key)
// survives.
function rewriteDefinition(definition = {}) {
  let count = 0;
  const rewriteTree = (node) => {
    if (Array.isArray(node)) {
      for (const entry of node) rewriteTree(entry);
      return;
    }
    if (!node || typeof node !== 'object' || node instanceof Date) return;
    if (node.typeId === FROM_TYPE) {
      node.typeId = TO_TYPE;
      count += 1;
    }
    if (node.type === FROM_TYPE && ('id' in node)) {
      node.type = TO_TYPE;
      count += 1;
    }
    for (const entry of Object.values(node)) rewriteTree(entry);
  };
  const data = definition.data && typeof definition.data === 'object' ? definition.data : definition;
  rewriteTree(data);
  return count;
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
  const added = rewriteDefinition(definition);
  if (added > 0) {
    report.definitionsRewritten += 1;
    report.nodesRewritten += added;
    await persist('process_definitions', { _id: definition._id }, { $set: { data: definition.data } });
  }
}

console.log(JSON.stringify(report, null, 2));
console.log(apply ? 'restart the app to rebuild declaration caches' : 'dry-run — pass --apply to persist');
process.exit(0);
