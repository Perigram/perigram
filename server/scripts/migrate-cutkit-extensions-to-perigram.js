import { connectDB } from '../db/mongo.js';

/**
 * One-shot migration for the CutKit → Perigram rename. Persisted entity
 * payloads keep authoring extensions under `extensions.cutkit` (cassette
 * graph trees, joint drivers, nodi inputs); every runtime seam now reads
 * `extensions.perigram`. This script renames the key at any document depth
 * in every non-system collection. Documents that already carry both keys
 * keep `extensions.perigram` as-is and are reported, never overwritten.
 *
 * Usage: node server/scripts/migrate-cutkit-extensions-to-perigram.js [--dry-run]
 */

const dryRun = process.argv.includes('--dry-run');
const db = await connectDB();

// Returns { value, changed } — pure deep transform; only a `cutkit` key
// whose parent object is `extensions` is renamed, and only when no
// `perigram` sibling already exists.
function renameCutkitExtensions(node, stats) {
    if (Array.isArray(node)) {
        let changed = false;
        const next = node.map(item => {
            const result = renameCutkitExtensions(item, stats);
            changed = changed || result.changed;
            return result.value;
        });
        return { value: changed ? next : node, changed };
    }
    if (!node || typeof node !== 'object') return { value: node, changed: false };
    let changed = false;
    const next = {};
    for (const [key, child] of Object.entries(node)) {
        if (key === 'extensions' && child && typeof child === 'object' && !Array.isArray(child)) {
            const hasLegacy = Object.hasOwn(child, 'cutkit');
            const hasCurrent = Object.hasOwn(child, 'perigram');
            if (hasLegacy && hasCurrent) {
                stats.conflicts += 1;
            } else if (hasLegacy) {
                const { cutkit, ...rest } = child;
                next[key] = { ...rest, perigram: cutkit };
                changed = true;
                continue;
            }
        }
        const result = renameCutkitExtensions(child, stats);
        changed = changed || result.changed;
        next[key] = result.value;
    }
    return { value: changed ? next : node, changed };
}

const collections = (await db.listCollections().toArray()).map(c => c.name)
    .filter(name => !name.startsWith('system.'));

let totalRenamed = 0;
let totalConflicts = 0;
for (const name of collections) {
    const stats = { conflicts: 0 };
    let renamed = 0;
    for await (const doc of db.collection(name).find({})) {
        const { value, changed } = renameCutkitExtensions(doc, stats);
        if (!changed) continue;
        if (!dryRun) {
            await db.collection(name).replaceOne({ _id: doc._id }, value);
        }
        renamed += 1;
    }
    if (renamed || stats.conflicts) {
        console.log(`${name}: ${renamed} document(s) renamed${stats.conflicts ? `, ${stats.conflicts} conflict(s) kept as perigram` : ''}`);
    }
    totalRenamed += renamed;
    totalConflicts += stats.conflicts;
}

console.log(`migrate-cutkit-extensions-to-perigram: ${totalRenamed} document(s) across ${collections.length} collection(s), ${totalConflicts} conflict(s)${dryRun ? ' (dry run)' : ''}`);
process.exit(0);
