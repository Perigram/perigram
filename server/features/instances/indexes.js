// Derived instance indexes (SPEC §13, canonical contract in this
// feature's README): the index set derives from the registry view — never
// a hand-mirrored list. `deriveInstanceIndexes` is pure over the view;
// `ensureInstanceIndexes` applies every definition idempotently.
import { connectDB } from '~/server/db/mongo';
import { CLASS_COLLECTIONS } from '~/packages/cts/src/index.js';

function indexEntry(collection, keys) {
  return { collection, keys };
}

export function deriveInstanceIndexes(view = new Map()) {
  const indexes = [];
  const collectionsInUse = new Set();

  for (const type of view.values()) {
    const collection = CLASS_COLLECTIONS[type.class];
    if (!collection) continue;
    collectionsInUse.add(collection);

    // Declared relation edges: reverse lookups on the owner's collection.
    for (const key of Object.keys(type.edges?.relations || {})) {
      indexes.push(indexEntry(collection, { type: 1, organizationId: 1, [`relations.${key}`]: 1 }));
    }

    // Declared children edges: the parent declares the key, the child
    // stores it — the index lands on each child type's class collection.
    for (const [key, edge] of Object.entries(type.edges?.children || {})) {
      for (const childTypeId of edge?.types || []) {
        const childType = view.get(childTypeId);
        const childCollection = childType ? CLASS_COLLECTIONS[childType.class] : collection;
        if (!childCollection) continue;
        collectionsInUse.add(childCollection);
        indexes.push(indexEntry(childCollection, { type: 1, organizationId: 1, [`lineage.${key}`]: 1 }));
      }
    }
  }

  // Base set per class collection in use: list ordering + state windows.
  for (const collection of collectionsInUse) {
    indexes.push(indexEntry(collection, { type: 1, organizationId: 1, createdAt: -1 }));
    indexes.push(indexEntry(collection, { type: 1, organizationId: 1, 'states.main': 1 }));
  }

  return indexes;
}

export async function ensureInstanceIndexes(view = new Map()) {
  const definitions = deriveInstanceIndexes(view);
  const db = await connectDB();
  for (const { collection, keys } of definitions) {
    await db.collection(collection).createIndex(keys, { background: true });
  }
  return definitions;
}
