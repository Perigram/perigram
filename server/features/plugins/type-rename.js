// A covered type rename (SPEC §20) rewrites the org's stored world to
// the new id: instance discriminators, typed refs, and authored type
// bindings. Bare-id refs stay as they are — the record keeps its id
// through the rename.
import { connectDB } from '~/server/db/mongo';
import { CLASS_COLLECTIONS } from '~/packages/cts/src/index.js';

function rewriteRefs(value, from, to, state) {
  if (Array.isArray(value)) {
    for (const entry of value) rewriteRefs(entry, from, to, state);
    return;
  }
  if (!value || typeof value !== 'object' || value instanceof Date) return;
  if (value.type === from && value.id != null) {
    value.type = to;
    state.touched = true;
  }
  for (const entry of Object.values(value)) rewriteRefs(entry, from, to, state);
}

function rewriteTypeBindings(node, from, to, state) {
  if (Array.isArray(node)) {
    for (const entry of node) rewriteTypeBindings(entry, from, to, state);
    return;
  }
  if (!node || typeof node !== 'object' || node instanceof Date) return;
  if (node.typeId === from) {
    node.typeId = to;
    state.touched = true;
  }
  if (node.type === from && 'id' in node) {
    node.type = to;
    state.touched = true;
  }
  for (const entry of Object.values(node)) rewriteTypeBindings(entry, from, to, state);
}

export async function applyTypeRename({ from, to }, organizationId) {
  const organization = String(organizationId);
  const db = await connectDB();
  const now = new Date().toISOString();
  const report = { instances: 0, documents: 0, definitions: 0 };

  for (const collection of Object.values(CLASS_COLLECTIONS)) {
    const renamed = await db.collection(collection).updateMany(
      { type: from, organizationId: organization },
      { $set: { type: to, updatedAt: now } }
    );
    report.instances += renamed.modifiedCount || 0;

    // Typed refs live under relation keys and ref fields; the dot path
    // reaches single objects and array elements alike.
    const cursor = db.collection(collection).find({
      organizationId: organization,
      $or: [{ 'relations.type': from }, { 'fields.type': from }]
    });
    for await (const doc of cursor) {
      const state = { touched: false };
      rewriteRefs(doc.relations, from, to, state);
      rewriteRefs(doc.fields, from, to, state);
      if (!state.touched) continue;
      await db.collection(collection).updateOne(
        { _id: doc._id },
        { $set: { relations: doc.relations, fields: doc.fields, updatedAt: now } }
      );
      report.documents += 1;
    }
  }

  // Authored graph records carry type bindings (`typeId` slots and
  // `{type, id}` ref objects) on the persisted draft shape.
  const definitions = db.collection('process_definitions').find({ organizationId: organization });
  for await (const definition of definitions) {
    const state = { touched: false };
    rewriteTypeBindings(
      definition.data && typeof definition.data === 'object' ? definition.data : definition,
      from, to, state
    );
    if (!state.touched) continue;
    await db.collection('process_definitions').updateOne(
      { _id: definition._id },
      { $set: { data: definition.data, updatedAt: now } }
    );
    report.definitions += 1;
  }
  return report;
}
