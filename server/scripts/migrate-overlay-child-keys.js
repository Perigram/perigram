// One-shot repair (instance-overlays README — the section key grammar):
// rewrites stored overlay order entries carrying the retired
// `children:<lineageKey>` key to the unique `children:<lineageKey>:<typeId>`
// form. The child type resolves from the stored process definitions'
// compiled screen contracts directly (no API auth needed); an edge the
// migration cannot resolve keeps its stored entry — composition drops it
// as naming nothing and the declared sections append in derivation order,
// so nothing is lost either way.
//
//   node server/scripts/migrate-overlay-child-keys.js
//   node server/scripts/migrate-overlay-child-keys.js --apply
import { connectDB } from '../db/mongo.js';

const APPLY = process.argv.includes('--apply');
const db = await connectDB();

// lineage-edge -> child type ids, from every ACTIVE definition's compiled
// instanceDetail screens (the author-org-sheet-machine precedent: read the
// stored documents, write through the same repository).
const lineageChildrenByType = new Map();
const definitions = await db.collection('process_definitions').find({}).toArray();
for (const definition of definitions) {
  const snapshots = [definition.data, definition.data?.activated].filter(Boolean);
  for (const snapshot of snapshots) {
    for (const screen of Object.values(snapshot.compiled?.screens || {})) {
      const typeId = screen?.typeId;
      if (!typeId || screen?.template !== 'instanceDetail') continue;
      const byEdge = lineageChildrenByType.get(typeId) || new Map();
      for (const source of screen.sources || []) {
        if (!source?.lineage || source.typeId === typeId) continue;
        const key = source.lineage.key;
        const list = byEdge.get(key) || [];
        list.push(source.typeId);
        byEdge.set(key, list);
      }
      lineageChildrenByType.set(typeId, byEdge);
    }
  }
}

const overlays = await db.collection('instance_overlays').find({}).toArray();
let changed = 0;
for (const overlay of overlays) {
  const typeId = String(overlay.typeId || '');
  const byEdge = lineageChildrenByType.get(typeId);
  if (!byEdge || !Array.isArray(overlay.order)) continue;
  let touched = false;
  const order = overlay.order.map(entry => {
    // Two retired spellings rewrite: the bare lineage key
    // (`children:<lineageKey>`) and the placeholder the first attempt at
    // this migration stamped (`children:<lineageKey>:TYPEID`).
    const match = String(entry).match(/^children:([a-zA-Z0-9-]+?)(?::TYPEID)?$/);
    if (!match) return entry;
    const candidates = [...new Set(byEdge.get(match[1]) || [])];
    if (candidates.length !== 1) return entry;
    touched = true;
    return `children:${match[1]}:${candidates[0]}`;
  });
  if (!touched) continue;
  changed += 1;
  console.log(`${overlay.typeId}/${overlay.instanceId}: ${JSON.stringify(overlay.order)} -> ${JSON.stringify(order)}`);
  if (APPLY) {
    await db.collection('instance_overlays').updateOne(
      { _id: overlay._id },
      { $set: { order, updatedAt: new Date().toISOString() } }
    );
  }
}
console.log(`${APPLY ? '' : '[dry-run] '}overlay orders rewritten: ${changed}, total: ${overlays.length}`);
process.exit(0);
