// Derived instance indexes (SPEC §13, canonical contract in this
// feature's README): the index set derives from the registry view — never
// a hand-mirrored list. Unique constraints compile to scoped Mongo indexes.
import { createHash } from 'node:crypto';
import { connectDB } from '~/server/db/mongo';
import { CLASS_COLLECTIONS, isRefDescriptor } from '#packages/cts';

function indexEntry(collection, keys, options = { background: true }) {
  return { collection, keys, options };
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function bsonTypeFor(descriptor) {
  if (['string', 'id', 'instant', 'enum'].includes(descriptor?.base)) return 'string';
  if (descriptor?.base === 'number') return 'number';
  if (descriptor?.base === 'boolean') return 'bool';
  return null;
}

function descriptorAtPath(fields, fieldPath) {
  let row = fields || {};
  let descriptor = null;
  const segments = String(fieldPath || '').split('.');
  for (let index = 0; index < segments.length; index += 1) {
    descriptor = row[segments[index]] || null;
    if (!descriptor) return null;
    if (index < segments.length - 1) {
      if (descriptor.base !== 'record') return null;
      row = descriptor.fields || {};
    }
  }
  return descriptor;
}

export function deriveInstanceIndexes(view = new Map(), { organizationId = null } = {}) {
  const indexes = [];
  const collectionsInUse = new Set();
  const stateAxesByCollection = new Map();

  for (const type of view.values()) {
    const collection = CLASS_COLLECTIONS[type.class];
    if (!collection) continue;
    collectionsInUse.add(collection);
    const axes = stateAxesByCollection.get(collection) || new Set();
    for (const axis of Object.keys(type.states || {})) axes.add(axis);
    stateAxesByCollection.set(collection, axes);

    // Declared relations: reverse lookups on the owner's collection. Ref
    // fields share the relation slot with explicit edge entries.
    const relationKeys = new Set(Object.keys(type.edges?.relations || {}));
    for (const [name, descriptor] of Object.entries(type.fields || {})) {
      if (isRefDescriptor(descriptor)) relationKeys.add(name);
    }
    for (const key of relationKeys) {
      indexes.push(indexEntry(collection, { type: 1, organizationId: 1, ['relations.' + key]: 1 }));
    }

    // Declared children edges: the parent declares the key, the child
    // stores it — the index lands on each child type's class collection,
    // keyed by the edge's DECLARED lineageKey (SPEC §6), never the
    // entry's map key.
    for (const [key, edge] of Object.entries(type.edges?.children || {})) {
      const lineageKey = edge?.lineageKey || key;
      for (const childTypeId of edge?.types || []) {
        const childType = view.get(childTypeId);
        const childCollection = childType ? CLASS_COLLECTIONS[childType.class] : collection;
        if (!childCollection) continue;
        collectionsInUse.add(childCollection);
        indexes.push(indexEntry(childCollection, { type: 1, organizationId: 1, ['lineage.' + lineageKey]: 1 }));
      }
    }

    for (const constraint of type.constraints || []) {
      if (constraint.kind !== 'unique') continue;
      const fieldPath = 'fields.' + constraint.field;
      const bsonType = bsonTypeFor(descriptorAtPath(type.fields, constraint.field));
      if (!bsonType) continue; // The CTS registry reports the declaration error.
      const scopedOrganizationId = type.scope === 'org'
        ? String(organizationId || type.organizationId || '')
        : null;
      if (type.scope === 'org' && !scopedOrganizationId) continue;
      const scopeKey = scopedOrganizationId ? 'o_' + hash(scopedOrganizationId) : 'g';
      const name = 'cts_u_' + scopeKey + '_' + hash(type.id + ':' + constraint.id + ':' + fieldPath);
      const keys = scopedOrganizationId
        ? { type: 1, organizationId: 1, [fieldPath]: 1 }
        : { type: 1, [fieldPath]: 1 };
      const partialFilterExpression = { type: type.id, [fieldPath]: { $type: bsonType } };
      if (scopedOrganizationId) partialFilterExpression.organizationId = scopedOrganizationId;
      indexes.push(indexEntry(collection, keys, {
        unique: true,
        name,
        partialFilterExpression,
        collation: { locale: 'simple' }
      }));
    }
  }

  // Base set per class collection in use: list ordering plus one state
  // window for every axis declared by a type stored in that collection.
  for (const collection of collectionsInUse) {
    indexes.push(indexEntry(collection, { type: 1, organizationId: 1, createdAt: -1 }));
    const declaredAxes = stateAxesByCollection.get(collection);
    const axes = declaredAxes?.size ? declaredAxes : new Set(['main']);
    for (const axis of axes) {
      indexes.push(indexEntry(collection, { type: 1, organizationId: 1, ['states.' + axis]: 1 }));
    }
  }

  return indexes;
}

export async function ensureInstanceIndexes(view = new Map(), options = {}) {
  const definitions = deriveInstanceIndexes(view, options);
  const db = await connectDB();
  for (const { collection, keys, options: indexOptions } of definitions) {
    await db.collection(collection).createIndex(keys, indexOptions);
  }
  return definitions;
}

export async function pruneInstanceUniqueIndexes(view = new Map(), { organizationId = null } = {}) {
  const desired = new Set(
    deriveInstanceIndexes(view, { organizationId })
      .filter(index => index.options?.unique)
      .map(index => index.options.name)
  );
  const prefixes = ['cts_u_g_'];
  if (organizationId) prefixes.push('cts_u_o_' + hash(organizationId) + '_');
  const db = await connectDB();
  const dropped = [];
  for (const collection of new Set(Object.values(CLASS_COLLECTIONS))) {
    const target = db.collection(collection);
    if (typeof target.listIndexes !== 'function' || typeof target.dropIndex !== 'function') continue;
    let indexes = [];
    try {
      indexes = await target.listIndexes().toArray();
    } catch (error) {
      // Mongo reports a missing collection as code 26 / NamespaceNotFound.
      if (Number(error?.code) !== 26 && error?.codeName !== 'NamespaceNotFound') throw error;
    }
    for (const index of indexes) {
      if (!index.name || !prefixes.some(prefix => index.name.startsWith(prefix)) || desired.has(index.name)) continue;
      await target.dropIndex(index.name);
      dropped.push({ collection, name: index.name });
    }
  }
  return dropped;
}
